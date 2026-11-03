import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";

import {
  masteredElements as masteredElementsSchema,
  statement as statementSchema,
} from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

interface ElementContent {
  english: string;
}

@Injectable()
export class MasteredElementService {
  constructor(@Inject(DB) private db: DbType) {}

  async addMasteredElement(userId: string, content: ElementContent) {
    if (!content.english) {
      throw new BadRequestException("Element english content is required");
    }

    if (await this.isMastered(userId, content)) {
      throw new BadRequestException("这个内容已经掌握了");
    }

    const [entity] = await this.db
      .insert(masteredElementsSchema)
      .values({
        userId,
        content: JSON.stringify(content),
        masteredAt: new Date(),
      })
      .returning();

    entity.content = JSON.parse(entity.content as string);
    return entity;
  }

  async getMasteredElements(userId: string) {
    const result = await this.db
      .select()
      .from(masteredElementsSchema)
      .where(eq(masteredElementsSchema.userId, userId))
      .orderBy(desc(masteredElementsSchema.masteredAt));

    return result.map((item) => ({
      ...item,
      content: JSON.parse(item.content as string),
    }));
  }

  async removeMasteredElement(userId: string, elementId: string) {
    const result = await this.db
      .delete(masteredElementsSchema)
      .where(
        and(eq(masteredElementsSchema.userId, userId), eq(masteredElementsSchema.id, elementId)),
      )
      .returning();

    if (result.length === 0) {
      throw new NotFoundException(
        `Mastered element with id ${elementId} not found for user ${userId}`,
      );
    }

    return result[0];
  }

  /**
   * 取若干收藏项的练习数据：英文原句 + 中文 + 音标。
   * 收藏表只存了 english，中文和音标按 english 去 statements 表里反查，
   * 查不到（句子已从课程里删掉）时返回空串，前端退化成听写模式。
   */
  async getPracticeItems(userId: string, ids: string[]) {
    if (!ids.length) return [];

    const rows = await this.db
      .select()
      .from(masteredElementsSchema)
      .where(
        and(eq(masteredElementsSchema.userId, userId), inArray(masteredElementsSchema.id, ids)),
      );

    const englishList = rows
      .map((row) => JSON.parse(row.content as string) as ElementContent)
      .map((content) => content.english);

    const statements = englishList.length
      ? await this.db
          .select({
            english: statementSchema.english,
            chinese: statementSchema.chinese,
            soundmark: statementSchema.soundmark,
          })
          .from(statementSchema)
          .where(inArray(statementSchema.english, englishList))
      : [];

    const statementMap = new Map(statements.map((item) => [item.english, item]));

    // 保持前端传入的顺序，方便按选择顺序练
    const rowMap = new Map(rows.map((row) => [row.id, row]));

    return ids
      .map((id) => rowMap.get(id))
      .filter((row): row is NonNullable<typeof row> => !!row)
      .map((row) => {
        const content = JSON.parse(row.content as string) as ElementContent;
        const matched = statementMap.get(content.english);
        return {
          id: row.id,
          english: content.english,
          chinese: matched?.chinese ?? "",
          soundmark: matched?.soundmark ?? "",
        };
      });
  }

  async isMastered(userId: string, content: ElementContent) {
    const result = await this.db
      .select()
      .from(masteredElementsSchema)
      .where(
        and(
          eq(masteredElementsSchema.userId, userId),
          eq(masteredElementsSchema.content, JSON.stringify(content)),
        ),
      )
      .limit(1);

    return result.length > 0;
  }
}
