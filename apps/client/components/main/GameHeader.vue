<template>
  <header class="game-header">
    <div class="header-left">
      <button
        class="back-btn"
        :class="{ 'is-busy': isLeaving }"
        title="返回课程列表（进度会自动保存）"
        @click="backToCourseList"
      >
        <UIcon
          name="i-ph-arrow-left"
          class="back-icon"
        />
        <span>返回</span>
      </button>
      <div class="pack-block">
        <div class="pack-title">{{ coursePackTitle }}</div>
        <div class="course-title">{{ courseStore.currentCourse?.title }}</div>
      </div>
    </div>

    <div class="header-right">
      <div class="question-index">
        第 <b>{{ currentIndex }}</b> 题 / 共 <b>{{ totalCount }}</b> 题
      </div>
      <div class="percent-line">
        <span class="percent">{{ percent }}<i>%</i></span>
      </div>
    </div>

    <!-- 低频操作：平时淡出，鼠标移入才显现 -->
    <div class="tools">
      <button
        v-if="courseStore.currentCourse?.video"
        class="tool-btn"
        title="看这节课的视频"
        @click="openVideo"
      >
        <UIcon
          name="i-ph-play-circle"
          class="h-4 w-4"
        />
      </button>
      <button
        class="tool-btn"
        title="题目列表"
        @click="openCourseContents"
      >
        <UIcon
          name="i-ph-list-dashes"
          class="h-4 w-4"
        />
      </button>
      <button
        v-if="isDictationMode()"
        class="tool-btn"
        title="游戏设置"
        @click="openGameSettingModal"
      >
        <UIcon
          name="i-ph-gear"
          class="h-4 w-4"
        />
      </button>
      <button
        v-if="isAuthenticated()"
        class="tool-btn"
        title="暂停"
        @click="pauseGame"
      >
        <UIcon
          name="i-ph-pause"
          class="h-4 w-4"
        />
      </button>
      <button
        class="tool-btn"
        title="重置本课进度"
        @click="handleDoAgain"
      >
        <UIcon
          name="i-ph-arrow-counter-clockwise"
          class="h-4 w-4"
        />
      </button>
      <button
        class="tool-btn"
        title="排行榜"
        @click="rankingStore.showRankModal"
      >
        <UIcon
          name="i-ph-ranking"
          class="h-4 w-4"
        />
      </button>
    </div>

    <MainCourseContents v-model:isOpen="isOpenCourseContents" />
    <RankRankingBoard />
  </header>
</template>

<script setup lang="ts">
import { useModal } from "#imports";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import Dialog from "~/components/common/Dialog.vue";
import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useGameMode } from "~/composables/main/game";
import { clearQuestionInput } from "~/composables/main/question";
import { useCourseContents } from "~/composables/main/useCourseContents";
import { useGamePause } from "~/composables/main/useGamePause";
import { useGameSetting } from "~/composables/main/useGameSetting";
import { useRanking } from "~/composables/rank/rankingList";
import { useGamePlayMode } from "~/composables/user/gamePlayMode";
import { isAuthenticated } from "~/services/auth";
import { useCourseStore } from "~/store/course";
import { useCoursePackStore } from "~/store/coursePack";
import { flushProgress } from "~/store/statement";

const router = useRouter();
const courseStore = useCourseStore();
const coursePackStore = useCoursePackStore();
const { openCourseContents } = useCourseContents();
const { openGameSettingModal } = useGameSetting();
const { pauseGame } = useGamePause();
const { isDictationMode } = useGamePlayMode();
const rankingStore = useRanking();
const { focusInput } = useQuestionInput();
const modal = useModal();

const isOpenCourseContents = ref(false);
const isLeaving = ref(false);

const coursePackTitle = computed(() => coursePackStore.currentCoursePack?.title || "学习");
const currentIndex = computed(() => courseStore.visibleStatementIndex + 1);
const totalCount = computed(() => courseStore.visibleStatementsCount);
const percent = computed(() => {
  if (courseStore.isAllDone()) return 100;
  // 按「已进行到第几题」算，避免第 1 题显示 0%
  const value = (courseStore.visibleStatementIndex + 1) / courseStore.visibleStatementsCount;
  return Math.min(100, Math.max(0, Math.round(value * 100)));
});

async function backToCourseList() {
  if (isLeaving.value) return;
  isLeaving.value = true;

  // 离开前把当前题目下标立刻写回，保证再进来时接着这一题学
  try {
    await flushProgress();
  } finally {
    const coursePackId = courseStore.currentCourse?.coursePackId;
    if (coursePackId) {
      router.push(`/course-pack/${coursePackId}`);
    } else {
      isLeaving.value = false;
    }
  }
}

function openVideo() {
  if (courseStore.currentCourse?.video) {
    window.open(courseStore.currentCourse.video, "_blank");
  }
}

function useDoAgain() {
  const { showQuestion } = useGameMode();

  function handleDoAgain() {
    modal.open(Dialog, {
      title: "重置进度",
      content: "是否确认重置当前课程进度？",
      showCancel: true,
      showConfirm: true,
      async onCancel() {
        setTimeout(() => {
          focusInput();
        }, 300);
      },
      async onConfirm() {
        handleTipConfirm();
      },
    });
  }

  function handleTipConfirm() {
    courseStore.doAgain();
    clearQuestionInput();
    showQuestion();
    courseTimer.reset();
    setTimeout(() => {
      focusInput();
    }, 300);
  }

  return { handleDoAgain };
}

const { handleDoAgain } = useDoAgain();
</script>

<style scoped>
.game-header {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 34px 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 15px 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(140, 180, 205, 0.55);
  background-color: rgba(255, 255, 255, 0.72);
  font-size: 14.5px;
  font-weight: 500;
  color: #17493b;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(23, 73, 59, 0.06);
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.1s ease,
    opacity 0.16s ease;
}

.back-btn:hover {
  background-color: #fff;
  border-color: rgba(96, 152, 186, 0.75);
  box-shadow: 0 3px 10px rgba(45, 110, 150, 0.14);
  transform: translateY(-1px);
}

.back-btn:active {
  transform: scale(0.98);
}

.back-btn.is-busy {
  opacity: 0.55;
  pointer-events: none;
}

.back-icon {
  width: 17px;
  height: 17px;
}

.pack-block {
  min-width: 0;
}

.pack-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #12293c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.course-title {
  margin-top: 3px;
  font-size: 12.5px;
  color: #5c7f99;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  flex-shrink: 0;
  text-align: right;
}

.question-index {
  font-size: 14.5px;
  color: #5c7f99;
  letter-spacing: 0.3px;
}

.question-index b {
  font-weight: 700;
  color: #2c5d7c;
}

.percent-line {
  margin-top: 2px;
}

.percent {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.1;
  color: #12293c;
  font-variant-numeric: tabular-nums;
}

.percent i {
  font-size: 22px;
  font-style: normal;
  font-weight: 600;
  margin-left: 1px;
}

.tools {
  position: absolute;
  right: 30px;
  bottom: -30px;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 5;
}

.game-header:hover .tools {
  opacity: 1;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  color: #46738f;
  transition: background-color 0.15s ease;
}

.tool-btn:hover {
  background-color: rgba(255, 255, 255, 0.8);
  color: #17493b;
}
</style>
