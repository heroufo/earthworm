import { defineStore } from "pinia";
import { ref } from "vue";

import type { CoursePack, CoursePacksItem } from "~/types";
import { fetchCourseHistory } from "~/api/course-history";
import { fetchCoursePack, fetchCoursePacks, removeCoursePack } from "~/api/course-pack";

export const useCoursePackStore = defineStore("course-pack", () => {
  const coursePacks = ref<CoursePacksItem[]>([]);
  const currentCoursePack = ref<CoursePack>();

  async function setupCoursePacks() {
    const res = await fetchCoursePacks();
    coursePacks.value = res;
  }

  /**
   * 拉取某个课程包（含每节课的学习进度）。
   * force = true 时忽略缓存，回到列表页会重新算一遍进度条。
   */
  async function setupCoursePack(coursePackId: string, force = false) {
    if (!force && coursePackId === currentCoursePack.value?.id) return;

    const res = await fetchCoursePack(coursePackId);
    currentCoursePack.value = res;
  }

  async function updateCoursesCompleteCount(coursePackId: string) {
    const courseHistory = await fetchCourseHistory(coursePackId);

    const find = (courseId: string) =>
      courseHistory.find((history) => history.courseId === courseId);

    currentCoursePack.value?.courses.forEach((course) => {
      const matchCourseHistory = find(course.id);

      if (matchCourseHistory) {
        course.completionCount = matchCourseHistory.completionCount;
      }
    });
  }

  /** 删除课程包：先从列表摘掉，接口失败再放回原位 */
  async function deleteCoursePack(coursePackId: string) {
    const index = coursePacks.value.findIndex(({ id }) => id === coursePackId);
    const removed = index === -1 ? null : coursePacks.value[index];

    if (index !== -1) coursePacks.value.splice(index, 1);
    if (currentCoursePack.value?.id === coursePackId) currentCoursePack.value = undefined;

    try {
      return await removeCoursePack(coursePackId);
    } catch (error) {
      if (removed) coursePacks.value.splice(index, 0, removed);
      throw error;
    }
  }

  return {
    setupCoursePack,
    setupCoursePacks,
    updateCoursesCompleteCount,
    deleteCoursePack,
    currentCoursePack,
    coursePacks,
  };
});
