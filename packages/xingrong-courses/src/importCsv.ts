/**
 * 课程包 CSV 导入工具
 *
 * 用法：
 *   pnpm -F @earthworm/xingrong-courses import:csv --file ./my.csv
 *   pnpm -F @earthworm/xingrong-courses import:csv --file ./my.csv --dry-run
 *   pnpm -F @earthworm/xingrong-courses import:csv --file ./my.csv --replace
 *   pnpm -F @earthworm/xingrong-courses import:csv --file ./my.csv --cover https://.../a.jpg
 *   pnpm -F @earthworm/xingrong-courses import:csv --file ./my.csv --cover-file ./我拍的图.jpg
 *
 * CSV 列（顺序随意，表头名匹配即可）：
 *   课程包名称, 课程包简介, 课程名称, 中文, 英文, 音标
 *
 * 特性：
 *   - 自动识别 UTF-8（含 BOM）与 GBK（Windows Excel 默认另存编码）
 *   - 支持 Excel 合并单元格习惯：课程包名称 / 课程名称 留空则沿用上一行
 *   - 同名课程包、同名课自动复用，不会重复创建；句子默认追加
 *   - --replace 会先清空该课程包下已有的课和句子，再重建
 *   - 不清空其它课程包，不影响 db:upload 灌入的星荣课程
 */
import fs from "node:fs";
import path from "node:path";

import { asc, eq } from "drizzle-orm";

import { db } from "@earthworm/db";
import {
  coursePack,
  course as courseSchema,
  statement as statementSchema,
} from "@earthworm/schema";

/* ------------------------------------------------------------------ */
/* 参数                                                                */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);

function getArg(name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : fallback;
}

const hasFlag = (name: string) => args.includes(name);

const DEFAULT_FILE = path.resolve(__dirname, "../data/import/课程包模板.csv");

/**
 * pnpm -F 会把工作目录切到子包，导致用户从仓库根传入的相对路径解析不到。
 * 这里依次尝试：当前目录 → 仓库根 → 子包目录。
 */
function resolveInputFile(raw: string): string {
  if (path.isAbsolute(raw)) return raw;
  const candidates = [
    path.resolve(raw),
    path.resolve(__dirname, "../../../", raw),
    path.resolve(__dirname, "..", raw),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const inputFile = resolveInputFile(getArg("--file", DEFAULT_FILE) as string);
const dryRun = hasFlag("--dry-run");
const replace = hasFlag("--replace");
const creatorId = getArg("--creator", process.env.LOCAL_USER_ID || "local-user") as string;
const shareLevel = getArg("--share", "public") as string;

/**
 * 本地封面图片：转成 data URI 直接存进 cover 字段。
 *
 * 为什么不复制到 public 目录：Nitro 生产模式只会服务「构建时已存在」的静态文件，
 * 构建后新放进去的图片会被 SPA 的 index.html 兜底（content-type 变成 text/html），
 * 浏览器拿到的是 HTML 而不是图片，等于没生效。内联成 data URI 则立即生效、无需构建，
 * 而且图片跟着数据库走，换电脑迁移 pgdata 时封面不会丢。
 */
function toCoverDataUri(file: string): string {
  const src = resolveInputFile(file);
  if (!fs.existsSync(src)) throw new Error(`封面文件不存在：${src}`);

  const ext = (path.extname(src).slice(1) || "jpeg").toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
  };
  const mime = mimeMap[ext];
  if (!mime) throw new Error(`不支持的封面格式 .${ext}，请用 jpg / png / webp / gif / svg`);

  const buf = fs.readFileSync(src);
  if (buf.length > 2 * 1024 * 1024) {
    throw new Error(
      `封面图 ${(buf.length / 1024 / 1024).toFixed(1)}MB 太大了（上限 2MB），建议先压缩到 300KB 以内`,
    );
  }

  console.log(
    `[封面] ${path.basename(src)}（${(buf.length / 1024).toFixed(0)}KB）已内联为 data URI`,
  );
  return `data:${mime};base64,${buf.toString("base64")}`;
}

let explicitCover = "";
const localCoverFile = getArg("--cover-file", "");
if (localCoverFile) {
  explicitCover = toCoverDataUri(localCoverFile);
} else {
  explicitCover = getArg("--cover", "") as string;
}

/** 新建包时用：没指定封面就走本地兜底图 */
const coverUrl = explicitCover || "/covers/default.svg";

/* ------------------------------------------------------------------ */
/* CSV 读取与解析                                                       */
/* ------------------------------------------------------------------ */

function readText(file: string): string {
  const buf = fs.readFileSync(file);
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  // 先按严格 UTF-8 试，失败再退回 GBK
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    console.log("[提示] 文件不是 UTF-8 编码，已按 GBK 解码");
    return new TextDecoder("gbk").decode(buf);
  }
}

/** RFC4180 风格解析：支持引号包裹、字段内逗号与换行、"" 转义 */
function parseCsv(text: string): string[][] {
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/* ------------------------------------------------------------------ */
/* 表头映射                                                            */
/* ------------------------------------------------------------------ */

const COLUMN_ALIASES: Record<string, string[]> = {
  packTitle: ["课程包名称", "课程包", "课程包名", "packtitle", "pack", "packname"],
  packDescription: ["课程包简介", "课程包描述", "简介", "描述", "packdescription", "description"],
  courseTitle: ["课程名称", "课名", "课程", "coursetitle", "course", "coursename"],
  chinese: ["中文", "chinese", "cn"],
  english: ["英文", "english", "en"],
  soundmark: ["音标", "soundmark", "phone", "phonetic"],
};

function resolveHeader(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const key = h
      .trim()
      .toLowerCase()
      .replace(/[\s_*]/g, "");
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (map[field] !== undefined) continue;
      if (aliases.some((a) => a.toLowerCase().replace(/[\s_*]/g, "") === key)) {
        map[field] = idx;
        return;
      }
    }
  });
  return map;
}

/* ------------------------------------------------------------------ */
/* 数据结构                                                            */
/* ------------------------------------------------------------------ */

type Statement = { chinese: string; english: string; soundmark: string };
type CourseGroup = { title: string; statements: Statement[] };
type PackGroup = {
  title: string;
  description: string;
  courses: CourseGroup[];
  courseIndex: Map<string, CourseGroup>;
};

function buildGroups(rows: string[][], col: Record<string, number>): PackGroup[] {
  const packs: PackGroup[] = [];
  const packIndex = new Map<string, PackGroup>();

  let currentPackTitle = "";
  let currentPackDesc = "";
  let currentCourseTitle = "";

  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r];
    const cell = (field: string) => {
      const i = col[field];
      return i === undefined ? "" : (raw[i] ?? "").trim();
    };

    const packTitleCell = cell("packTitle");
    const rankDescCell = cell("packDescription");
    const courseTitleCell = cell("courseTitle");

    // 合并单元格习惯：空值沿用上一行
    if (packTitleCell) {
      currentPackTitle = packTitleCell;
      currentPackDesc = rankDescCell;
      currentCourseTitle = ""; // 换包后课名重新开始
    } else if (rankDescCell) {
      currentPackDesc = rankDescCell;
    }
    if (courseTitleCell) currentCourseTitle = courseTitleCell;

    const chinese = cell("chinese");
    const english = cell("english");
    const soundmark = cell("soundmark");

    // 整行没有句子内容就跳过（例如只写了课名的小标题行）
    if (!chinese && !english) continue;

    if (!currentPackTitle) {
      throw new Error(`第 ${r + 1} 行缺少「课程包名称」，且上面没有可沿用的课程包名`);
    }
    if (!chinese || !english) {
      throw new Error(
        `第 ${r + 1} 行「中文」「英文」不能为空（中文="${chinese}"，英文="${english}"）`,
      );
    }

    let pack = packIndex.get(currentPackTitle);
    if (!pack) {
      pack = {
        title: currentPackTitle,
        description: currentPackDesc,
        courses: [],
        courseIndex: new Map(),
      };
      packIndex.set(currentPackTitle, pack);
      packs.push(pack);
    }
    if (currentPackDesc) pack.description = currentPackDesc;

    const courseTitle = currentCourseTitle || "第一课";
    let course = pack.courseIndex.get(courseTitle);
    if (!course) {
      course = { title: courseTitle, statements: [] };
      pack.courseIndex.set(courseTitle, course);
      pack.courses.push(course);
    }

    course.statements.push({
      chinese,
      english,
      soundmark: soundmark || "",
    });
  }

  return packs;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function log(...msg: unknown[]) {
  console.log(...msg);
}

async function main() {
  log("=".repeat(60));
  log("earthworm 课程包导入");
  log("=".repeat(60));

  if (!fs.existsSync(inputFile)) {
    throw new Error(
      `找不到文件：${inputFile}\n可复制模板：packages/xingrong-courses/data/import/课程包模板.csv`,
    );
  }

  const rows = parseCsv(readText(inputFile));
  if (rows.length < 2) throw new Error("CSV 里没有数据行，至少需要表头 + 1 行句子");

  const col = resolveHeader(rows[0]);
  const missing = ["chinese", "english"].filter((f) => col[f] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `表头缺少必需列：${missing.join(", ")}\n当前表头：${rows[0].join(" | ")}\n` +
        `需要包含「中文」「英文」两列（音标、课程名称、课程包名称可选）`,
    );
  }

  const packs = buildGroups(rows, col);
  if (packs.length === 0) throw new Error("解析后没有任何句子，请检查 CSV 内容");

  log("");
  log(`[1] 文件：${inputFile}`);
  log(`[2] 解析结果：${packs.length} 个课程包`);
  for (const p of packs) {
    const total = p.courses.reduce((n, c) => n + c.statements.length, 0);
    log(`    - 「${p.title}」${p.courses.length} 课 / ${total} 句`);
    for (const c of p.courses) {
      log(`        · ${c.title}（${c.statements.length} 句）`);
    }
  }

  if (dryRun) {
    log("");
    log("[3] --dry-run 模式：只解析，不写数据库。");
    log("=".repeat(60));
    process.exit(0);
  }

  log("");
  log("[3] 开始写入数据库 ...");

  // 现有最大 order，保证新包排到最后
  const existingPacks = await db
    .select({ id: coursePack.id, title: coursePack.title, order: coursePack.order })
    .from(coursePack)
    .orderBy(asc(coursePack.order));

  let nextPackOrder = existingPacks.reduce((max, p) => Math.max(max, p.order ?? 0), 0) + 1;

  for (const pack of packs) {
    // ---- 课程包：存在则复用 ----
    let packRow = existingPacks.find((p) => p.title === pack.title);

    if (packRow) {
      log(`    [复用] 课程包「${pack.title}」(id=${packRow.id})`);
      // 只有显式传了 --cover / --cover-file 才覆盖已有包的封面
      if (explicitCover) {
        await db
          .update(coursePack)
          .set({ cover: explicitCover })
          .where(eq(coursePack.id, packRow.id));
        log(`    [封面] 已更新为 ${explicitCover}`);
      }
      if (replace) {
        const oldCourses = await db
          .select({ id: courseSchema.id })
          .from(courseSchema)
          .where(eq(courseSchema.coursePackId, packRow.id));
        for (const c of oldCourses) {
          await db.delete(statementSchema).where(eq(statementSchema.courseId, c.id));
        }
        await db.delete(courseSchema).where(eq(courseSchema.coursePackId, packRow.id));
        log(`    [清空] --replace 已删除该包下 ${oldCourses.length} 课及其句子`);
      }
    } else {
      const [created] = await db
        .insert(coursePack)
        .values({
          order: nextPackOrder++,
          title: pack.title,
          description: pack.description,
          isFree: true,
          cover: coverUrl,
          creatorId,
          shareLevel,
        })
        .returning({ id: coursePack.id, order: coursePack.order });
      packRow = { id: created.id, title: pack.title, order: created.order };
      existingPacks.push(packRow);
      log(`    [新建] 课程包「${pack.title}」(id=${created.id})`);
    }

    // ---- 课：同名复用 ----
    const existingCourses = await db
      .select({ id: courseSchema.id, title: courseSchema.title, order: courseSchema.order })
      .from(courseSchema)
      .where(eq(courseSchema.coursePackId, packRow.id))
      .orderBy(asc(courseSchema.order));

    let nextCourseOrder = existingCourses.reduce((max, c) => Math.max(max, c.order ?? 0), 0) + 1;

    for (const course of pack.courses) {
      let courseRow = existingCourses.find((c) => c.title === course.title);

      if (courseRow) {
        log(`    [复用] 第 ${courseRow.order} 课「${course.title}」`);
      } else {
        const [created] = await db
          .insert(courseSchema)
          .values({
            coursePackId: packRow.id,
            title: course.title,
            order: nextCourseOrder++,
            video: "",
          })
          .returning({ id: courseSchema.id, order: courseSchema.order });
        courseRow = { id: created.id, title: course.title, order: created.order };
        existingCourses.push(courseRow);
        log(`    [新建] 第 ${created.order} 课「${course.title}」`);
      }

      // ---- 句子：默认追加到该课末尾，重复句子自动跳过 ----
      const existingStatements = await db
        .select({
          order: statementSchema.order,
          chinese: statementSchema.chinese,
          english: statementSchema.english,
        })
        .from(statementSchema)
        .where(eq(statementSchema.courseId, courseRow.id));

      const existingKeys = new Set(existingStatements.map((s) => `${s.chinese}\u0000${s.english}`));

      let order = existingStatements.reduce((max, s) => Math.max(max, s.order ?? 0), 0) + 1;

      const fresh = course.statements.filter(
        (s) => !existingKeys.has(`${s.chinese}\u0000${s.english}`),
      );
      const skipped = course.statements.length - fresh.length;

      if (fresh.length === 0) {
        log(`        = 已存在全部 ${skipped} 句，跳过`);
        continue;
      }

      const values = fresh.map((s) => ({
        order: order++,
        chinese: s.chinese,
        english: s.english,
        soundmark: s.soundmark,
        courseId: courseRow.id,
      }));

      // 分批插入，避免单条 SQL 参数过多
      const BATCH = 200;
      for (let i = 0; i < values.length; i += BATCH) {
        await db.insert(statementSchema).values(values.slice(i, i + BATCH));
      }
      log(`        + ${values.length} 句` + (skipped > 0 ? `（跳过 ${skipped} 句重复）` : ""));
    }
  }

  log("");
  log("[4] 全部完成");
  log("=".repeat(60));
  log("打开 http://localhost:3000/course-pack 查看，无需重启服务");
  process.exit(0);
}

main().catch((err) => {
  console.error("");
  console.error("[失败] " + (err instanceof Error ? err.message : String(err)));
  console.error("=".repeat(60));
  process.exit(1);
});
