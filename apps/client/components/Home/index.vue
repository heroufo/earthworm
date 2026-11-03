<template>
  <div class="mt-8 flex w-full flex-col">
    <!-- 课程包区域 -->
    <div class="mb-4 flex justify-between border-b pb-2 dark:border-gray-700">
      <div class="text-xl font-medium">最近使用的课程包</div>
      <NuxtLink
        href="/course-pack"
        class="link text-blue-500 no-underline hover:opacity-75"
        >更多课程包
      </NuxtLink>
    </div>
    <HomeRecentCoursePack />
    <HomeCalendarGraph
      class="mt-10"
      :data="learningDailyTimeList"
      :totalLearningTime="learningDailyTotalTime"
    />
  </div>
</template>

<script setup lang="ts">
import { useAsyncData } from "#imports";

import { fetchTodayLearningTime } from "~/api/user-learning-activity";
import { useLearningDailyTime } from "~/composables/learningDailyTime";
import { useLearningTimeTracker } from "../../composables/main/learningTimeTracker";

const { learningDailyTimeList, learningDailyTotalTime, setupLearningDailyTime } =
  useLearningDailyTime();

// 打卡图的数据由这里主动拉一次（原来靠年份按钮的 toggleYear 事件触发）
setupLearningDailyTime();

useAsyncData(async () => {
  // 同步今日的学习总时长
  const { setupLearningTime } = useLearningTimeTracker();
  setupLearningTime(await fetchTodayLearningTime());
});
</script>

<style scoped></style>
