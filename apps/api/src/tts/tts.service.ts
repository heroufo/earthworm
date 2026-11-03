import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";

import { statement } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

/**
 * 微软神经语音（Edge Read Aloud）
 * ------------------------------------------------------------
 * 原来的发音源是有道 dictvoice：它本质是「单词录音拼接」，词与词之间有
 * 断裂感、整句语调平，长句还会直接 500 不给音频。这里改成微软的神经网络
 * 语音（与 Azure TTS 同一套声学模型），有自然的升降调、连读与停顿。
 *
 * 合成走子进程里的 worker.py（edge-tts），常驻复用，避免每次启动 Python。
 * 所有结果按 (音色|语速|文本) 的哈希落盘缓存，命中时直接吐文件：
 *   - 全库预生成之后，播放是纯静态文件，零延迟、零网络依赖
 *   - 新导入的句子首次合成约 0.6 秒，之后同样走缓存
 */

export interface TtsSpeakOptions {
  text: string;
  voice?: string;
  rate?: string;
}

export interface PrewarmStatus {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  startedAt: number | null;
  finishedAt: number | null;
  voice: string;
  rate: string;
  lastError: string | null;
}

interface PendingJob {
  resolve: (bytes: number) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

@Injectable()
export class TtsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TtsService.name);

  private readonly enabled = process.env.TTS_ENABLED !== "false";
  private readonly defaultVoice = process.env.TTS_VOICE || "en-US-JennyNeural";
  private readonly defaultRate = process.env.TTS_RATE || "+0%";
  private readonly cacheDir = process.env.TTS_CACHE_DIR
    ? resolve(process.env.TTS_CACHE_DIR)
    : resolve(process.cwd(), "storage", "tts");
  private readonly pythonExe = process.env.TTS_PYTHON || "python";
  private readonly workerScript = process.env.TTS_WORKER_SCRIPT
    ? resolve(process.env.TTS_WORKER_SCRIPT)
    : resolve(process.cwd(), "..", "..", "tools", "tts-worker", "worker.py");
  private readonly concurrency = Number(process.env.TTS_CONCURRENCY || 8);
  /**
   * 预生成单独限流：占用比交互请求少的并发，留几个名额给「用户点句子」的实时合成，
   * 否则预生成跑满 8 个槽位时，点一句要排在队列后面（实测 3.7s，正常只要 0.6s）。
   */
  private readonly prewarmConcurrency = Number(
    process.env.TTS_PREWARM_CONCURRENCY ||
      Math.max(3, Number(process.env.TTS_CONCURRENCY || 8) - 3),
  );
  private readonly jobTimeout = Number(process.env.TTS_JOB_TIMEOUT_MS || 25000);

  private worker: ChildProcessWithoutNullStreams | null = null;
  private workerBroken = false;
  private seq = 0;
  private readonly pending = new Map<string, PendingJob>();
  private readonly inflight = new Map<string, Promise<Buffer>>();

  private active = 0;
  private readonly waiters: (() => void)[] = [];
  /** 预生成进行中又收到补齐请求 → 结束后再来一轮 */
  private prewarmQueued = false;

  private prewarm: PrewarmStatus = {
    running: false,
    total: 0,
    done: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
    voice: this.defaultVoice,
    rate: this.defaultRate,
    lastError: null,
  };

  constructor(@Inject(DB) private readonly db: DbType) {}

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log("TTS 已关闭（TTS_ENABLED=false），继续使用有道音频");
      return;
    }
    try {
      await mkdir(this.cacheDir, { recursive: true });
      this.logger.log(`TTS 缓存目录：${this.cacheDir}`);
      this.spawnWorker();
      // 启动后自动补齐：新导入/新加进来的句子会在后台变成静态文件
      this.requestPrewarm(Number(process.env.TTS_AUTO_PREWARM_DELAY_MS || 15000));
    } catch (error) {
      this.logger.error(`TTS 初始化失败：${(error as Error).message}`);
    }
  }

  /**
   * 后台补齐音频（不阻塞调用方）
   * ------------------------------------------------------------
   * 已经有缓存的句子会直接跳过，所以这个接口可以随便调：
   *   - CSV 导入课程包之后调一次，新句子就会自动变成静态文件
   *   - 服务启动时调一次，兜住「用命令行脚本导进来的包」
   */
  requestPrewarm(delayMs = 1500) {
    if (!this.enabled || process.env.TTS_AUTO_PREWARM === "false") return;
    const timer = setTimeout(() => {
      // 正在跑的那一轮抓不到刚导入的句子，标记一下，等它跑完再补一轮
      if (this.prewarm.running) {
        this.prewarmQueued = true;
        this.logger.log("已排队：当前一轮预生成结束后会再补齐一次");
        return;
      }
      this.startPrewarm().catch((error) =>
        this.logger.warn(`自动补齐音频失败：${(error as Error).message}`),
      );
    }, delayMs);
    // 不要因为这个定时器让进程退不掉
    timer.unref?.();
  }

  onModuleDestroy() {
    this.stopWorker();
  }

  // ---------------- 对外能力 ----------------

  get voice() {
    return this.defaultVoice;
  }

  get rate() {
    return this.defaultRate;
  }

  isEnabled() {
    return this.enabled;
  }

  /** 音频缓存文件路径（同时作为「是否已生成」的判据） */
  cacheFileOf(text: string, voice = this.defaultVoice, rate = this.defaultRate) {
    const hash = createHash("sha256").update(`${voice}|${rate}|${text}`).digest("hex");
    return join(this.cacheDir, hash.slice(0, 2), `${hash}.mp3`);
  }

  hasCache(text: string, voice = this.defaultVoice, rate = this.defaultRate) {
    return existsSync(this.cacheFileOf(text, voice, rate));
  }

  /**
   * 取音频：命中缓存直接返回文件内容，否则合成后落盘再返回。
   * 同一句的并发请求会合并成一次合成。
   */
  async getAudio(options: TtsSpeakOptions): Promise<Buffer> {
    if (!this.enabled) throw new ServiceUnavailableException("TTS 未启用");

    const text = (options.text ?? "").trim();
    if (!text) throw new ServiceUnavailableException("缺少文本");
    if (text.length > 2000) throw new ServiceUnavailableException("文本过长");

    const voice = options.voice || this.defaultVoice;
    const rate = options.rate || this.defaultRate;
    const file = this.cacheFileOf(text, voice, rate);

    const cached = await this.readCached(file);
    if (cached) return cached;

    const running = this.inflight.get(file);
    if (running) return running;

    const task = this.produce(text, voice, rate, file).finally(() => {
      this.inflight.delete(file);
    });
    this.inflight.set(file, task);
    return task;
  }

  // ---------------- 合成流程 ----------------

  private async readCached(file: string): Promise<Buffer | null> {
    try {
      const info = await stat(file);
      // 小于 1KB 基本是半截文件或者错误响应，重合成
      if (info.size < 1024) return null;
      return await readFile(file);
    } catch {
      return null;
    }
  }

  private async produce(text: string, voice: string, rate: string, file: string): Promise<Buffer> {
    await this.acquire();
    try {
      await this.requestWorker(text, voice, rate, file);
      const buffer = await this.readCached(file);
      if (!buffer) throw new ServiceUnavailableException("合成结果不可用");
      return buffer;
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> | void {
    if (this.active < this.concurrency) {
      this.active += 1;
      return;
    }
    return new Promise<void>((resolveNext) => this.waiters.push(resolveNext));
  }

  private release() {
    const next = this.waiters.shift();
    if (next) {
      // 名额直接转交给排队的调用方，active 不减少
      next();
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }

  private requestWorker(text: string, voice: string, rate: string, out: string): Promise<number> {
    return new Promise<number>((resolveJob, rejectJob) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = this.ensureWorker();
      } catch (error) {
        rejectJob(error as Error);
        return;
      }

      const id = String(++this.seq);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectJob(new Error("合成超时"));
        // 超时往往意味着 worker 卡住，直接重启，别让后续句子继续排队
        this.restartWorker("合成超时");
      }, this.jobTimeout);

      this.pending.set(id, {
        resolve: resolveJob,
        reject: rejectJob,
        timer,
      });

      const payload = `${JSON.stringify({ id, text, voice, rate, out })}\n`;
      child.stdin.write(payload, (error) => {
        if (!error) return;
        const job = this.pending.get(id);
        if (!job) return;
        clearTimeout(job.timer);
        this.pending.delete(id);
        job.reject(error);
      });
    });
  }

  // ---------------- worker 进程管理 ----------------

  private ensureWorker(): ChildProcessWithoutNullStreams {
    if (this.worker && !this.worker.killed) return this.worker;
    if (this.workerBroken) throw new ServiceUnavailableException("语音合成进程不可用");
    return this.spawnWorker();
  }

  private spawnWorker(): ChildProcessWithoutNullStreams {
    if (!existsSync(this.workerScript)) {
      this.workerBroken = true;
      throw new ServiceUnavailableException(`找不到合成脚本：${this.workerScript}`);
    }

    const child = spawn(this.pythonExe, [this.workerScript], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        TTS_VOICE: this.defaultVoice,
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
      },
    });

    this.worker = child;

    const reader = createInterface({ input: child.stdout });
    reader.on("line", (line) => this.handleWorkerLine(line));

    child.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) this.logger.warn(`[tts-worker] ${message}`);
    });

    child.on("error", (error) => {
      this.logger.error(`语音合成进程启动失败：${error.message}`);
      this.workerBroken = true;
      this.failAllPending(new Error(`合成进程启动失败：${error.message}`));
    });

    child.on("exit", (code, signal) => {
      if (this.worker === child) this.worker = null;
      if (code !== 0 && code !== null) {
        this.logger.warn(`语音合成进程退出 code=${code} signal=${signal}`);
      }
      this.failAllPending(new Error("合成进程已退出"));
    });

    this.logger.log(`语音合成进程已启动：${this.pythonExe} ${this.workerScript}`);
    return child;
  }

  private handleWorkerLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let payload: any;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      this.logger.warn(`[tts-worker] 无法解析输出：${trimmed.slice(0, 200)}`);
      return;
    }

    if (payload.id === "__init__" && payload.ok === false) {
      this.logger.error(`语音合成不可用：${payload.error}`);
      this.workerBroken = true;
      this.failAllPending(new Error(payload.error ?? "合成不可用"));
      return;
    }

    const job = this.pending.get(String(payload.id));
    if (!job) return;
    clearTimeout(job.timer);
    this.pending.delete(String(payload.id));

    if (payload.ok) job.resolve(Number(payload.bytes ?? 0));
    else job.reject(new Error(payload.error ?? "合成失败"));
  }

  private failAllPending(error: Error) {
    for (const [id, job] of this.pending) {
      clearTimeout(job.timer);
      job.reject(error);
      this.pending.delete(id);
    }
  }

  private stopWorker() {
    if (!this.worker) return;
    try {
      this.worker.stdin.end();
      this.worker.kill();
    } catch {
      /* 忽略 */
    }
    this.worker = null;
  }

  private restartWorker(reason: string) {
    this.logger.warn(`重启语音合成进程：${reason}`);
    this.stopWorker();
    this.workerBroken = false;
    try {
      this.spawnWorker();
    } catch (error) {
      this.logger.error((error as Error).message);
    }
  }

  // ---------------- 全库预生成 ----------------

  prewarmStatus(): PrewarmStatus {
    return { ...this.prewarm };
  }

  async startPrewarm(options: { voice?: string; rate?: string } = {}) {
    if (!this.enabled) throw new ServiceUnavailableException("TTS 未启用");
    if (this.prewarm.running) return this.prewarmStatus();

    const voice = options.voice || this.defaultVoice;
    const rate = options.rate || this.defaultRate;

    const rows = await this.db
      .select({ english: statement.english })
      .from(statement)
      .groupBy(statement.english);

    const texts = rows
      .map((row) => (row.english ?? "").trim())
      .filter((text) => text.length > 0 && text.length <= 2000);

    this.prewarm = {
      running: true,
      total: texts.length,
      done: 0,
      failed: 0,
      startedAt: Date.now(),
      finishedAt: null,
      voice,
      rate,
      lastError: null,
    };

    void this.runPrewarm(texts, voice, rate);
    return this.prewarmStatus();
  }

  private async runPrewarm(texts: string[], voice: string, rate: string) {
    // 只用一部分并发，剩下的留给交互请求
    const chunkSize = Math.max(2, this.prewarmConcurrency);
    try {
      for (let index = 0; index < texts.length; index += chunkSize) {
        const chunk = texts.slice(index, index + chunkSize);
        await Promise.all(
          chunk.map(async (text) => {
            if (this.hasCache(text, voice, rate)) {
              this.prewarm.done += 1;
              return;
            }
            try {
              await this.getAudio({ text, voice, rate });
              this.prewarm.done += 1;
            } catch (error) {
              this.prewarm.failed += 1;
              this.prewarm.lastError = (error as Error).message;
            }
          }),
        );
      }
    } catch (error) {
      this.prewarm.lastError = (error as Error).message;
      this.logger.error(`预生成中断：${(error as Error).message}`);
    } finally {
      this.prewarm.running = false;
      this.prewarm.finishedAt = Date.now();
      this.logger.log(
        `预生成结束：成功 ${this.prewarm.done} / 失败 ${this.prewarm.failed} / 共 ${this.prewarm.total}`,
      );
      if (this.prewarmQueued) {
        this.prewarmQueued = false;
        this.logger.log("检测到排队请求，再补齐一轮");
        void this.startPrewarm().catch((error) =>
          this.logger.warn(`补齐音频失败：${(error as Error).message}`),
        );
      }
    }
  }

  /** 清掉缓存里的半截 / 损坏文件（预生成失败后可用） */
  async purgeBrokenCache() {
    const { readdir } = await import("node:fs/promises");
    let removed = 0;
    const dirs = await readdir(this.cacheDir, { withFileTypes: true }).catch(() => []);
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const sub = join(this.cacheDir, dir.name);
      const files = await readdir(sub, { withFileTypes: true }).catch(() => []);
      for (const file of files) {
        if (!file.isFile()) continue;
        const full = join(sub, file.name);
        const info = await stat(full).catch(() => null);
        if (info && info.size < 1024) {
          await unlink(full).catch(() => null);
          removed += 1;
        }
      }
    }
    return removed;
  }
}
