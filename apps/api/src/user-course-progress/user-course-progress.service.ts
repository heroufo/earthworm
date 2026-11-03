import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";

import { coursePack, userCourseProgress } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

@Injectable()
export class UserCourseProgressService {
  constructor(@Inject(DB) private db: DbType) {}

  async findStatement(userId: string, coursePackId: string, courseId: string) {
    const result = await this.db.query.userCourseProgress.findFirst({
      where: and(
        eq(userCourseProgress.userId, userId),
        eq(userCourseProgress.coursePackId, coursePackId),
        eq(userCourseProgress.courseId, courseId),
      ),
    });

    return result ? result.statementIndex : 0;
  }

  async getUserRecentCoursePacks(userId: string, limit: number) {
    const userCourseProgressResult = await this.db
      .select({
        id: userCourseProgress.id,
        coursePackId: userCourseProgress.coursePackId,
        courseId: userCourseProgress.courseId,
        title: coursePack.title,
        description: coursePack.description,
        cover: coursePack.cover,
        isFree: coursePack.isFree,
      })
      .from(userCourseProgress)
      .where(eq(userCourseProgress.userId, userId))
      .orderBy(desc(userCourseProgress.updatedAt))
      // 进度按课存（同一课程包会有多条），这里多取一些再去重，保证能凑够 limit 个包
      .limit(Math.max(limit * 10, 30))
      .leftJoin(coursePack, eq(userCourseProgress.coursePackId, coursePack.id));

    const seen = new Set<string>();
    const deduped: typeof userCourseProgressResult = [];
    for (const item of userCourseProgressResult) {
      if (seen.has(item.coursePackId)) continue;
      seen.add(item.coursePackId);
      deduped.push(item);
      if (deduped.length >= limit) break;
    }

    return deduped;
  }

  async upsert(userId: string, coursePackId: string, courseId: string, statementIndex: number) {
    await this.db
      .insert(userCourseProgress)
      .values({
        userId,
        coursePackId,
        courseId,
        statementIndex,
      })
      .onConflictDoUpdate({
        target: [
          userCourseProgress.userId,
          userCourseProgress.coursePackId,
          userCourseProgress.courseId,
        ],
        // updatedAt 显式写：on conflict 的更新不一定触发 $onUpdateFn，
        // 而「最近使用的课程包」靠它排序
        set: { statementIndex, updatedAt: new Date() },
      });
  }
}
