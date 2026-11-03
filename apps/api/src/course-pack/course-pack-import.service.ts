import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import {
  coursePack,
  course as courseSchema,
  statement as statementSchema,
} from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { TtsService } from "../tts/tts.service";

type StatementInput = { chinese: string; english: string; soundmark: string };
type CourseGroup = { title: string; statements: StatementInput[] };
type PackGroup = { title: string; description: string; courses: CourseGroup[] };
type PackDraft = PackGroup & { courseIndex: Map<string, CourseGroup> };

export interface ImportCoursePackResult {
  packs: {
    id: string;
    title: string;
    created: boolean;
    courses: { title: string; created: boolean; added: number; skipped: number }[];
  }[];
  total: { packs: number; courses: number; statements: number; skipped: number };
}

/** 导入前的预览：只看结构，不写库 */
export interface CoursePackPreviewResult {
  packs: {
    title: string;
    description: string;
    courses: { title: string; count: number }[];
  }[];
  total: { packs: number; courses: number; statements: number };
}

export interface ImportCoursePackOptions {
  /** 覆盖同名课程包（先删课和句子再重建） */
  replace?: boolean;
  /** 把这批句子全部导进指定的已有课程包，忽略 CSV 里的包名 */
  targetCoursePackId?: string;
  /** 只导入这些课程（按 CSV 里的课程名精确匹配），实现分批次导入 */
  courseTitles?: string[];
}

/** 表头别名：和 CSV 导入脚本保持一致，顺序随意 */
const COLUMN_ALIASES: Record<string, string[]> = {
  packTitle: ["课程包名称", "课程包", "课程包名", "packtitle", "pack", "packname"],
  packDescription: ["课程包简介", "课程包描述", "简介", "描述", "packdescription", "description"],
  courseTitle: ["课程名称", "课名", "课程", "coursetitle", "course", "coursename"],
  chinese: ["中文", "chinese", "cn"],
  english: ["英文", "english", "en"],
  soundmark: ["音标", "soundmark", "phone", "phonetic"],
};

const MAX_CSV_LENGTH = 5 * 1024 * 1024;

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

function buildGroups(rows: string[][], col: Record<string, number>): PackGroup[] {
  const packs: PackDraft[] = [];
  const packIndex = new Map<string, PackDraft>();

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
    const packDescCell = cell("packDescription");
    const courseTitleCell = cell("courseTitle");

    // 合并单元格习惯：空值沿用上一行
    if (packTitleCell) {
      currentPackTitle = packTitleCell;
      currentPackDesc = packDescCell;
      currentCourseTitle = "";
    } else if (packDescCell) {
      currentPackDesc = packDescCell;
    }
    if (courseTitleCell) currentCourseTitle = courseTitleCell;

    const chinese = cell("chinese");
    const english = cell("english");
    const soundmark = cell("soundmark");

    if (!chinese && !english) continue;

    if (!currentPackTitle) {
      throw new BadRequestException(`第 ${r + 1} 行缺少「课程包名称」，且上面没有可沿用的课程包名`);
    }
    if (!chinese || !english) {
      throw new BadRequestException(
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

    course.statements.push({ chinese, english, soundmark });
  }

  return packs;
}

@Injectable()
export class CoursePackImportService {
  constructor(
    @Inject(DB) private db: DbType,
    private readonly ttsService: TtsService,
  ) {}

  /** 解析 + 校验 CSV，返回按「包 → 课 → 句子」组织的数据 */
  private parsePacks(csvText: string): PackGroup[] {
    if (!csvText || typeof csvText !== "string") {
      throw new BadRequestException("CSV 内容为空");
    }
    if (csvText.length > MAX_CSV_LENGTH) {
      throw new BadRequestException("CSV 文件过大（上限 5MB）");
    }

    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      throw new BadRequestException("CSV 里没有数据行，至少需要表头 + 1 行句子");
    }

    const col = resolveHeader(rows[0]);
    const missing = ["chinese", "english"].filter((f) => col[f] === undefined);
    if (missing.length > 0) {
      throw new BadRequestException(
        `表头缺少必需列：${missing.join(", ")}。当前表头：${rows[0].join(" | ")}。` +
          `需要包含「中文」「英文」两列（音标、课程名称、课程包名称可选）`,
      );
    }

    const packs = buildGroups(rows, col);
    if (packs.length === 0) throw new BadRequestException("解析后没有任何句子，请检查 CSV 内容");
    return packs;
  }

  /** 导入前预览：先看这份 CSV 里有几个包、几节课、各多少句 */
  preview(csvText: string): CoursePackPreviewResult {
    const packs = this.parsePacks(csvText);

    return {
      packs: packs.map((pack) => ({
        title: pack.title,
        description: pack.description,
        courses: pack.courses.map((course) => ({
          title: course.title,
          count: course.statements.length,
        })),
      })),
      total: {
        packs: packs.length,
        courses: packs.reduce((sum, pack) => sum + pack.courses.length, 0),
        statements: packs.reduce(
          (sum, pack) => sum + pack.courses.reduce((n, course) => n + course.statements.length, 0),
          0,
        ),
      },
    };
  }

  async importFromCsv(
    creatorId: string,
    csvText: string,
    options: ImportCoursePackOptions = {},
  ): Promise<ImportCoursePackResult> {
    let packs = this.parsePacks(csvText);

    // 只导入选中的课程（分批导入的关键：一次只搬几节课进来）
    if (options.courseTitles && options.courseTitles.length > 0) {
      const keep = new Set(options.courseTitles);
      packs = packs
        .map((pack) => ({
          ...pack,
          courses: pack.courses.filter((course) => keep.has(course.title)),
        }))
        .filter((pack) => pack.courses.length > 0);

      if (packs.length === 0) {
        throw new BadRequestException("选中的课程在 CSV 里没有匹配到，请重新选择");
      }
    }

    // 指定目标课程包：忽略 CSV 里的包名，全部并进这个包
    if (options.targetCoursePackId) {
      const target = await this.db.query.coursePack.findFirst({
        where: eq(coursePack.id, options.targetCoursePackId),
      });
      if (!target) throw new NotFoundException("目标课程包不存在");

      const merged: PackGroup = {
        title: target.title,
        description: target.description ?? "",
        courses: [],
      };
      for (const pack of packs) {
        for (const course of pack.courses) {
          const same = merged.courses.find((item) => item.title === course.title);
          if (same) same.statements.push(...course.statements);
          else merged.courses.push({ ...course });
        }
      }
      packs = [merged];
    }

    const result: ImportCoursePackResult = {
      packs: [],
      total: { packs: 0, courses: 0, statements: 0, skipped: 0 },
    };

    const existingPacks = await this.db
      .select({ id: coursePack.id, title: coursePack.title, order: coursePack.order })
      .from(coursePack)
      .orderBy(asc(coursePack.order));

    let nextPackOrder = existingPacks.reduce((max, p) => Math.max(max, p.order ?? 0), 0) + 1;

    for (const pack of packs) {
      // 指定了目标包就按 id 命中；否则按 CSV 里的包名找同名包
      let packRow = options.targetCoursePackId
        ? existingPacks.find((p) => p.id === options.targetCoursePackId)
        : existingPacks.find((p) => p.title === pack.title);
      let packCreated = false;

      if (packRow) {
        // 往已有包里追加时绝不能执行 replace，否则会把之前几批导入的课一起删掉
        if (options.replace && !options.targetCoursePackId) {
          const oldCourses = await this.db
            .select({ id: courseSchema.id })
            .from(courseSchema)
            .where(eq(courseSchema.coursePackId, packRow.id));
          for (const c of oldCourses) {
            await this.db.delete(statementSchema).where(eq(statementSchema.courseId, c.id));
          }
          await this.db.delete(courseSchema).where(eq(courseSchema.coursePackId, packRow.id));
        }
      } else {
        const [created] = await this.db
          .insert(coursePack)
          .values({
            order: nextPackOrder++,
            title: pack.title,
            description: pack.description,
            isFree: true,
            cover: "/covers/default.svg",
            creatorId,
            shareLevel: "public",
          })
          .returning({ id: coursePack.id, title: coursePack.title, order: coursePack.order });
        packRow = created;
        packCreated = true;
        existingPacks.push(created);
      }

      const packResult = {
        id: packRow.id,
        title: pack.title,
        created: packCreated,
        courses: [] as { title: string; created: boolean; added: number; skipped: number }[],
      };

      const existingCourses = await this.db
        .select({ id: courseSchema.id, title: courseSchema.title, order: courseSchema.order })
        .from(courseSchema)
        .where(eq(courseSchema.coursePackId, packRow.id))
        .orderBy(asc(courseSchema.order));

      let nextCourseOrder = existingCourses.reduce((max, c) => Math.max(max, c.order ?? 0), 0) + 1;

      for (const course of pack.courses) {
        let courseRow = existingCourses.find((c) => c.title === course.title);
        let courseCreated = false;

        if (!courseRow) {
          const [created] = await this.db
            .insert(courseSchema)
            .values({
              coursePackId: packRow.id,
              title: course.title,
              order: nextCourseOrder++,
              video: "",
            })
            .returning({
              id: courseSchema.id,
              title: courseSchema.title,
              order: courseSchema.order,
            });
          courseRow = created;
          courseCreated = true;
          existingCourses.push(created);
        }

        const existingStatements = await this.db
          .select({
            order: statementSchema.order,
            chinese: statementSchema.chinese,
            english: statementSchema.english,
          })
          .from(statementSchema)
          .where(eq(statementSchema.courseId, courseRow.id));

        const existingKeys = new Set(
          existingStatements.map((s) => `${s.chinese}\u0000${s.english}`),
        );
        let order = existingStatements.reduce((max, s) => Math.max(max, s.order ?? 0), 0) + 1;

        const fresh = course.statements.filter(
          (s) => !existingKeys.has(`${s.chinese}\u0000${s.english}`),
        );
        const skipped = course.statements.length - fresh.length;

        if (fresh.length > 0) {
          const values = fresh.map((s) => ({
            order: order++,
            chinese: s.chinese,
            english: s.english,
            soundmark: s.soundmark,
            courseId: courseRow.id,
          }));
          const BATCH = 200;
          for (let i = 0; i < values.length; i += BATCH) {
            await this.db.insert(statementSchema).values(values.slice(i, i + BATCH));
          }
        }

        packResult.courses.push({
          title: course.title,
          created: courseCreated,
          added: fresh.length,
          skipped,
        });
        result.total.courses += 1;
        result.total.statements += fresh.length;
        result.total.skipped += skipped;
      }

      result.packs.push(packResult);
      result.total.packs += 1;
    }

    // 新句子先按需合成，这里顺手把整库缺的音频补齐成静态文件
    if (result.total.statements > 0) this.ttsService.requestPrewarm(2000);

    return result;
  }
}
