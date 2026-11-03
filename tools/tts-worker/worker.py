"""
微软神经语音合成 worker
====================================================================
由 NestJS（apps/api/src/tts）以子进程方式拉起，通过 stdin / stdout
按行交换 JSON，一个进程常驻，避免每次合成都付一次 Python 启动开销。

输入（每行一个 JSON）：
    {"id": "1", "text": "Hello.", "voice": "en-US-AvaNeural",
     "rate": "+0%", "out": "C:/cache/ab/cdef.mp3"}

输出（每行一个 JSON）：
    {"id": "1", "ok": true, "bytes": 12345}
    {"id": "1", "ok": false, "error": "..."}

依赖：edge-tts（pip install edge-tts）
代理：环境变量 TTS_PROXY，例如 http://127.0.0.1:7890；不配置则直连。
"""

import asyncio
import json
import os
import sys

try:
    import edge_tts
except Exception as exc:  # pragma: no cover - 环境缺依赖时给出可读信息
    sys.stdout.write(
        json.dumps(
            {"id": "__init__", "ok": False, "error": f"edge-tts 不可用: {exc}"},
            ensure_ascii=False,
        )
        + "\n"
    )
    sys.stdout.flush()
    raise SystemExit(1)

DEFAULT_VOICE = os.environ.get("TTS_VOICE", "en-US-AvaNeural")
PROXY = os.environ.get("TTS_PROXY") or None
CONCURRENCY = int(os.environ.get("TTS_WORKER_CONCURRENCY", "6"))
TIMEOUT = float(os.environ.get("TTS_WORKER_TIMEOUT", "30"))

_write_lock = asyncio.Lock()


async def emit(payload: dict) -> None:
    async with _write_lock:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()


async def synth(job: dict, sem: asyncio.Semaphore) -> None:
    job_id = job.get("id")
    async with sem:
        try:
            text = (job.get("text") or "").strip()
            if not text:
                raise ValueError("text 为空")
            voice = job.get("voice") or DEFAULT_VOICE
            rate = job.get("rate") or "+0%"
            out = job["out"]

            communicate = edge_tts.Communicate(text, voice, rate=rate, proxy=PROXY)
            buffer = bytearray()

            async def drain():
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        buffer.extend(chunk["data"])

            # wait_for 而不是 asyncio.timeout，兼容 Python 3.9+
            await asyncio.wait_for(drain(), timeout=TIMEOUT)

            if not buffer:
                raise RuntimeError("合成结果为空")

            os.makedirs(os.path.dirname(out), exist_ok=True)
            tmp = out + ".part"
            with open(tmp, "wb") as fp:
                fp.write(buffer)
            os.replace(tmp, out)

            await emit({"id": job_id, "ok": True, "bytes": len(buffer)})
        except Exception as exc:
            await emit({"id": job_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"})


async def main() -> None:
    loop = asyncio.get_running_loop()
    sem = asyncio.Semaphore(CONCURRENCY)
    running: set[asyncio.Task] = set()

    # 预热：让 edge 的 DNS / TLS 尽早完成，第一句不用等
    await emit({"id": "__ready__", "ok": True})

    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
        except Exception:
            continue
        if job.get("cmd") == "ping":
            await emit({"id": job.get("id"), "ok": True, "pong": True})
            continue
        task = asyncio.create_task(synth(job, sem))
        running.add(task)
        task.add_done_callback(running.discard)

    if running:
        await asyncio.gather(*running, return_exceptions=True)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
