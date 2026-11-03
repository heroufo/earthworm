import type { CourseApiResponse } from "./course";
import type { CoursePack, CoursePacksItem } from "~/types";
import { getHttp } from "./http";

export type CoursePacksItemApiResponse = {
  id: string;
  title: string;
  isFree: boolean;
  description: string;
  cover: string;
};

export interface CoursePackApiResponse {
  id: string;
  title: string;
  description: string;
  isFree: boolean;
  cover: string;
  courses: CourseApiResponse[];
}

export async function fetchCoursePacks() {
  const http = getHttp();
  return (await http<CoursePacksItemApiResponse[]>("/course-pack", {
    method: "get",
  })) as CoursePacksItem[];
}

export async function fetchCoursePack(coursePackId: string) {
  const http = getHttp();
  return (await http<CoursePackApiResponse>(`/course-pack/${coursePackId}`, {
    method: "get",
  })) as CoursePack;
}

export interface RemoveCoursePackResult {
  id: string;
  title: string;
  deletedCourses: number;
}

/** 删除课程包（连带课程、句子与学习记录） */
export async function removeCoursePack(coursePackId: string) {
  const http = getHttp();
  return await http<RemoveCoursePackResult>(`/course-pack/${coursePackId}`, {
    method: "delete",
  });
}

export interface ImportCoursePackResult {
  packs: {
    id: string;
    title: string;
    created: boolean;
    courses: { title: string; created: boolean; added: number; skipped: number }[];
  }[];
  total: { packs: number; courses: number; statements: number; skipped: number };
}

/** 导入前预览：这份 CSV 里有几个包、几节课、各多少句 */
export interface CoursePackPreviewResult {
  packs: {
    title: string;
    description: string;
    courses: { title: string; count: number }[];
  }[];
  total: { packs: number; courses: number; statements: number };
}

export interface ImportCoursePackOptions {
  /** 覆盖同名课程包 */
  replace?: boolean;
  /** 全部并入这个已有课程包（忽略 CSV 里的包名） */
  targetCoursePackId?: string;
  /** 只导入这几节课（按 CSV 里的课程名匹配） */
  courseTitles?: string[];
}

/** 新建空课程包 */
export async function createCoursePack(title: string, description = "") {
  const http = getHttp();
  return await http<CoursePacksItemApiResponse>("/course-pack", {
    method: "post",
    body: { title, description },
  });
}

/** 导入前预览 CSV 结构 */
export async function previewCoursePackCsv(csvText: string) {
  const http = getHttp();
  return await http<CoursePackPreviewResult>("/course-pack/preview", {
    method: "post",
    body: { csvText },
  });
}

export async function importCoursePackCsv(
  csvText: string,
  options: ImportCoursePackOptions | boolean = {},
) {
  const http = getHttp();
  // 兼容旧调用：第二个参数以前是 replace 布尔值
  const opts: ImportCoursePackOptions =
    typeof options === "boolean" ? { replace: options } : options;
  return await http<ImportCoursePackResult>("/course-pack/import", {
    method: "post",
    body: {
      csvText,
      replace: opts.replace === true,
      targetCoursePackId: opts.targetCoursePackId || undefined,
      courseTitles: opts.courseTitles?.length ? opts.courseTitles : undefined,
    },
  });
}
