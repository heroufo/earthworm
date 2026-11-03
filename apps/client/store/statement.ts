import type { Ref } from "vue";

import { debounce } from "lodash-es";
import { ref, watch } from "vue";

import type { Course } from "~/types";
import { fetchUpdateCourseProgress } from "~/api/user-course-progress";
import { isAuthenticated } from "~/services/auth";

const DEBOUNCE_TIME = 5000;
const INTERVAL_TIME = 60 * 1000 * 5;

let lastSavedIndex = 0;
let isSaveStatement = true;
const statementIndex = ref(0);

/** 立即保存进度的执行器，由 setupAutoSaveProgress 注入当前课程上下文 */
let flushHandler: (() => Promise<void>) | null = null;

/**
 * 立即把当前题目下标写回服务端。
 * 用于「返回课程列表」这类会离开页面、但不会触发 beforeunload 的场景，
 * 否则要从 5 秒防抖里等，进度可能丢失。
 */
export async function flushProgress() {
  if (flushHandler) await flushHandler();
}

export function useStatement() {
  function setupAutoSaveProgress(course: Ref<Course | undefined>) {
    // 课程的 statement 会被删除，
    // 如果记录的 statementIndex 所对应的 statement 被删除了
    // 那么默认返回第一个 statement
    if (course.value!.statementIndex >= course.value!.statements.length) {
      statementIndex.value = 0;
    } else {
      statementIndex.value = course.value!.statementIndex || 0;
    }

    const debouncedSaveProgress = debounce(() => {
      saveProgress();

      lastSavedIndex = statementIndex.value;
    }, DEBOUNCE_TIME);

    watch(
      () => statementIndex.value,
      () => {
        if (isAuthenticated()) {
          debouncedSaveProgress();
        }
      },
    );

    // 窗口关闭前保存
    window.addEventListener("beforeunload", () => {
      saveProgress();
    });

    // 页面失去焦点时保存
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        saveProgress();
      }
    });

    // 设置间隔性自动保存
    setInterval(() => {
      saveProgress();
    }, INTERVAL_TIME); // 每5分钟自动保存一次

    function saveProgress() {
      if (!isSaveStatement) return;

      if (statementIndex.value !== lastSavedIndex) {
        fetchUpdateCourseProgress({
          coursePackId: course.value!.coursePackId,
          courseId: course.value!.id,
          statementIndex: statementIndex.value,
        });
      }
    }

    // 供「返回课程列表」等手动离开的时机立刻落盘
    flushHandler = async () => {
      if (!course.value || !isAuthenticated()) return;
      try {
        await fetchUpdateCourseProgress({
          coursePackId: course.value.coursePackId,
          courseId: course.value.id,
          statementIndex: statementIndex.value,
        });
        lastSavedIndex = statementIndex.value;
      } catch {
        // 网络异常不阻塞返回，本地还有防抖与定时保存兜底
      }
    };
  }

  return {
    setupAutoSaveProgress,
    statementIndex,
  };
}

export function permitSaveStatement() {
  isSaveStatement = true;
}

export function preventSaveStatement() {
  isSaveStatement = false;
}
