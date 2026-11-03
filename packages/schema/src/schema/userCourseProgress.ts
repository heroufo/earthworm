import { createId } from "@paralleldrive/cuid2";
import { integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const userCourseProgress = pgTable(
  "user_course_progress",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    coursePackId: text("course_pack_id").notNull(),
    courseId: text("course_id").notNull(),

    /**
     * from Statement's order
     */
    statementIndex: integer("statement_index").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    /**
     * 一节课一行：课程列表要靠它按课算「已学进度」。
     * 早期版本是 (userId, coursePackId) 唯一，同一包里只有一条记录，
     * 换一节学就会把上一节的进度覆盖掉。
     */
    unq: unique().on(t.userId, t.coursePackId, t.courseId),
  }),
);
