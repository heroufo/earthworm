import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import {
  course,
  courseHistory,
  coursePack,
  statement,
  userCourseProgress,
  userLearningActivities,
} from "@earthworm/schema";
import { CourseHistoryService } from "../course-history/course-history.service";
import { CourseService } from "../course/course.service";
import { DB, DbType } from "../global/providers/db.provider";
import { MembershipService } from "../membership/membership.service";

@Injectable()
export class CoursePackService {
  constructor(
    @Inject(DB) private db: DbType,
    private readonly courseService: CourseService,
    private readonly courseHistoryService: CourseHistoryService,
    private readonly membershipService: MembershipService,
  ) {}

  async findAll(userId?: string) {
    let result = [];

    const publicCoursePacks = await this.findAllPublicCoursePacks();
    result.push(...publicCoursePacks);

    if (userId) {
      const userIdOwnedCoursePacks = await this.findAllForUser(userId);
      result.push(...userIdOwnedCoursePacks);

      // 看看是不是创始会员
      // 是的话 需要去查所有课程包的 shareLevel 为 founder_only 的
      if (await this.membershipService.isFounderMembership(userId)) {
        const founderOnlyCoursePacks = await this.findFounderOnly();
        result.push(...founderOnlyCoursePacks);
      }
    }

    return result;
  }

  async findFounderOnly() {
    const coursePacks = await this.db.query.coursePack.findMany({
      orderBy: asc(coursePack.order),
      where: and(eq(coursePack.shareLevel, "founder_only")), // TODO 缺一个 shareLevel 的枚举类型
    });

    return coursePacks;
  }

  async findAllForUser(userId: string) {
    const userIdOwnedCoursePacks = await this.db.query.coursePack.findMany({
      orderBy: asc(coursePack.order),
      where: and(eq(coursePack.creatorId, userId), eq(coursePack.shareLevel, "private")),
    });

    return userIdOwnedCoursePacks;
  }

  async findAllPublicCoursePacks() {
    return await this.db.query.coursePack.findMany({
      orderBy: asc(coursePack.order),
      where: eq(coursePack.shareLevel, "public"),
    });
  }

  async findOne(coursePackId: string) {
    const result = await this.db.query.coursePack.findFirst({
      where: eq(coursePack.id, coursePackId),
    });

    if (!result) {
      throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
    }

    return result;
  }

  async findOneWithCourses(userId: string, coursePackId: string) {
    const coursePackWithCourses = await this.findCoursePackWithCourses(coursePackId, userId);

    if (userId) {
      coursePackWithCourses.courses = await this.addCompletionCountsToCourses(
        userId,
        coursePackWithCourses.courses,
        coursePackId,
      );
    }

    return coursePackWithCourses;
  }

  private async findCoursePackWithCourses(coursePackId: string, userId: string) {
    const coursePackWithCourses = await this.db.query.coursePack.findFirst({
      where: and(eq(coursePack.id, coursePackId)),
      with: {
        courses: {
          orderBy: asc(course.order),
        },
      },
    });

    if (!coursePackWithCourses) {
      throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
    }

    if (coursePackWithCourses.shareLevel === "private") {
      if (coursePackWithCourses.creatorId === userId) {
        return coursePackWithCourses;
      } else {
        throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
      }
    } else if (coursePackWithCourses.shareLevel === "founder_only") {
      if (await this.membershipService.isFounderMembership(userId)) {
        return coursePackWithCourses;
      } else {
        throw new NotFoundException(`CoursePack with ID ${coursePackId} not found`);
      }
    } else {
      return coursePackWithCourses;
    }
  }

  private async addCompletionCountsToCourses(userId: string, courses: any[], coursePackId: string) {
    const courseIds = courses.map((item) => item.id);
    // 一次性把本包所有课程的句子数查出来，避免逐课 count
    const statementCounts = await this.countStatementsByCourse(courseIds);
    // 本包每节课上次学到的位置（按课存，换课不会互相覆盖）
    const learnedIndexes = await this.findLearnedIndexByCourse(userId, coursePackId);

    return await Promise.all(
      courses.map(async (course) => {
        const completionCount = await this.courseHistoryService.findCompletionCount(
          userId,
          coursePackId,
          course.id,
        );
        const statementCount = statementCounts[course.id] ?? 0;
        const learnedCount = computeLearnedCount(
          statementCount,
          learnedIndexes[course.id],
          completionCount,
        );

        return {
          ...course,
          completionCount,
          statementCount,
          learnedCount,
        };
      }),
    );
  }

  /**
   * 每节课上次学到的句子下标。
   * statementIndex 指的是「当前正在答的那句」，它之前的都算学过，
   * 所以下标本身就是已学句数。
   */
  private async findLearnedIndexByCourse(userId: string, coursePackId: string) {
    const rows = await this.db
      .select({
        courseId: userCourseProgress.courseId,
        statementIndex: userCourseProgress.statementIndex,
      })
      .from(userCourseProgress)
      .where(
        and(
          eq(userCourseProgress.userId, userId),
          eq(userCourseProgress.coursePackId, coursePackId),
        ),
      );

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.courseId] = Math.max(acc[row.courseId] ?? 0, row.statementIndex);
      return acc;
    }, {});
  }

  /** 批量统计每节课的句子数量 */
  private async countStatementsByCourse(courseIds: string[]) {
    if (courseIds.length === 0) return {} as Record<string, number>;

    const rows = await this.db
      .select({
        courseId: statement.courseId,
        total: sql<number>`count(*)::int`,
      })
      .from(statement)
      .where(inArray(statement.courseId, courseIds))
      .groupBy(statement.courseId);

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.courseId] = Number(row.total);
      return acc;
    }, {});
  }

  async findCourse(userId: string, coursePackId: string, courseId: string) {
    if (userId) {
      return await this.courseService.findWithUserProgress(coursePackId, courseId, userId);
    } else {
      return await this.courseService.find(coursePackId, courseId);
    }
  }

  async findNextCourse(coursePackId: string, courseId: string) {
    return await this.courseService.findNext(coursePackId, courseId);
  }

  async completeCourse(userId: string, coursePackId: string, courseId: string) {
    return await this.courseService.completeCourse(userId, coursePackId, courseId);
  }

  /**
   * 删除课程包（连带课程、句子、学习进度、完成记录）
   *
   * 表之间只有 courses -> course_packs 有外键，且没有 onDelete cascade，
   * 所以必须按「句子 → 课程 → 进度/记录 → 课程包」的顺序手动删干净，
   * 否则会因外键约束直接把删除卡住。
   */
  /**
   * 新建空课程包
   * ------------------------------------------------------------
   * 用于「先建好包，再分几批把课程导进来」的流程：
   * 包名重名时自动追加序号，不覆盖已有的包。
   */
  async create(userId: string, input: { title?: string; description?: string }) {
    const title = (input.title ?? "").trim();
    if (!title) throw new BadRequestException("课程包名称不能为空");
    if (title.length > 40) throw new BadRequestException("课程包名称最多 40 个字");
    const description = (input.description ?? "").trim().slice(0, 200);

    const existing = await this.db
      .select({ id: coursePack.id, title: coursePack.title, order: coursePack.order })
      .from(coursePack)
      .orderBy(asc(coursePack.order));

    const titles = new Set(existing.map((p) => p.title));
    let finalTitle = title;
    let index = 2;
    while (titles.has(finalTitle)) {
      finalTitle = `${title}（${index++}）`;
    }

    const nextOrder = existing.reduce((max, p) => Math.max(max, p.order ?? 0), 0) + 1;

    const [created] = await this.db
      .insert(coursePack)
      .values({
        order: nextOrder,
        title: finalTitle,
        description,
        isFree: true,
        cover: "/covers/default.svg",
        creatorId: userId,
        shareLevel: "public",
      })
      .returning();

    return created;
  }

  async remove(userId: string, coursePackId: string) {
    const pack = await this.findOne(coursePackId);

    const isLocalMode = process.env.LOCAL_MODE !== "false";
    if (!isLocalMode && pack.creatorId && pack.creatorId !== userId) {
      throw new ForbiddenException("只能删除自己创建的课程包");
    }

    const courses = await this.db.query.course.findMany({
      where: eq(course.coursePackId, coursePackId),
    });
    const courseIds = courses.map((c) => c.id);

    if (courseIds.length > 0) {
      await this.db.delete(statement).where(inArray(statement.courseId, courseIds));
      await this.db
        .delete(userLearningActivities)
        .where(inArray(userLearningActivities.courseId, courseIds));
    }

    await this.db.delete(course).where(eq(course.coursePackId, coursePackId));
    await this.db.delete(courseHistory).where(eq(courseHistory.coursePackId, coursePackId));
    await this.db
      .delete(userCourseProgress)
      .where(eq(userCourseProgress.coursePackId, coursePackId));
    await this.db.delete(coursePack).where(eq(coursePack.id, coursePackId));

    return {
      id: coursePackId,
      title: pack.title,
      deletedCourses: courseIds.length,
    };
  }
}

/**
 * 算一节课「已学多少句」，用于课程列表的进度条。
 *
 * 三个来源取最靠后的那个：
 * 1. 完整学过至少一次 → 直接算 100%
 * 2. 上次学到的位置（statementIndex 之前都算学过）
 * 3. 没有记录 → 0
 * 最后用句子总数封顶，防止句子被删过之后下标越界。
 */
function computeLearnedCount(
  statementCount: number,
  statementIndex: number | undefined,
  completionCount: number,
) {
  if (statementCount <= 0) return 0;
  if (completionCount > 0) return statementCount;
  return Math.min(statementCount, Math.max(0, statementIndex ?? 0));
}
