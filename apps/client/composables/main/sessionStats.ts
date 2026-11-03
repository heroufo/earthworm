import { computed, ref } from "vue";

// 本次学习会话的答题统计，刷新页面归零。
// 只统计真正提交过的题（自动判分），跳过的题不计入。
const correctCount = ref(0);
const wrongCount = ref(0);

export function useSessionStats() {
  const answeredCount = computed(() => correctCount.value + wrongCount.value);

  const accuracy = computed(() => {
    if (answeredCount.value === 0) return 0;
    return Math.round((correctCount.value / answeredCount.value) * 100);
  });

  function recordCorrect() {
    correctCount.value += 1;
  }

  function recordWrong() {
    wrongCount.value += 1;
  }

  function reset() {
    correctCount.value = 0;
    wrongCount.value = 0;
  }

  return {
    correctCount,
    wrongCount,
    answeredCount,
    accuracy,
    recordCorrect,
    recordWrong,
    reset,
  };
}
