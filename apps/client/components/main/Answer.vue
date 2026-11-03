<template>
  <div class="answer-panel">
    <!-- 上一题回顾 -->
    <div
      v-if="prevStatement"
      class="prev-line"
    >
      <span class="prev-label">上一题</span>
      <span class="prev-sep">|</span>
      <span class="prev-en">{{ prevStatement.english }}</span>
      <UIcon
        name="i-ph-check-bold"
        class="prev-check"
      />
      <span class="prev-cn">{{ prevStatement.chinese }}</span>
    </div>

    <!-- 中文主句 -->
    <div class="thesis-wrap">
      <h1
        class="thesis"
        :class="{ 'is-long': thesisLength > 14 }"
      >
        {{ thesis }}
      </h1>
      <button
        class="sound-btn"
        title="播放整句发音"
        @click="handlePlayEnglishSound"
      >
        <UIcon
          name="i-ph-speaker-simple-high"
          class="h-5 w-5"
        />
      </button>
    </div>

    <!-- 逐词拆解 -->
    <div
      class="word-row"
      :class="{ 'is-dense': cards.length > 9 }"
    >
      <div
        v-for="(card, index) in cards"
        :key="`${card.text}-${index}`"
        class="word-col"
        @click="handlePlayWordSound(card.text)"
      >
        <span
          v-if="card.pos"
          class="pos-tag"
          :style="{ backgroundColor: posColor(card.pos) }"
          >{{ card.pos }}</span
        >
        <span
          v-else
          class="pos-tag pos-tag-empty"
        ></span>

        <div class="word-en">{{ card.text }}</div>
        <div class="word-rule"></div>
        <div class="word-phonetic">{{ card.phonetic || " " }}</div>
        <div class="word-cn">{{ card.translation || " " }}</div>
      </div>
    </div>

    <!-- 统计 -->
    <div class="stat-row">
      <div class="stat-pill">
        已答对 <b>{{ stats.correctCount.value }}</b>
      </div>
      <div class="stat-pill">
        已答错 <b>{{ stats.wrongCount.value }}</b>
      </div>
      <div class="stat-pill">
        实时正确率 <b>{{ stats.accuracy.value }}%</b>
      </div>
    </div>

    <!-- 操作 -->
    <div class="action-row">
      <button
        class="pill-btn"
        @click="goToPreviousQuestion"
      >
        上一题
      </button>
      <button
        class="pill-btn"
        @click="showQuestion"
      >
        重新听写
      </button>
      <button
        class="pill-btn"
        @click="skipQuestion"
      >
        跳过本题
      </button>
      <button
        class="pill-btn"
        @click="markStatementAsMastered"
      >
        <UIcon
          name="i-ph-star"
          class="star-icon"
        />
        收藏
      </button>
      <button
        class="primary-btn"
        @click="goToNextQuestion"
      >
        下一题
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";

import {
  recentlyPlayedDetached,
  useCurrentStatementEnglishSound,
} from "~/composables/main/englishSound";
import { usePlayWordSound } from "~/composables/main/englishSound/audio";
import { useGameMode } from "~/composables/main/game";
import { useSessionStats } from "~/composables/main/sessionStats";
import { useMastered } from "~/composables/main/useMastered";
import { buildWordCards, useWordInfo } from "~/composables/main/wordInfo";
import { useAutoPronunciation } from "~/composables/user/sound";
import { useCourseStore } from "~/store/course";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";
import { useAnswer } from "./QuestionInput/useAnswer";

const courseStore = useCourseStore();
const { handlePlayWordSound } = usePlayWordSound();
const { showQuestion } = useGameMode();
const { goToNextQuestion } = useAnswer();
const { markStatementAsMastered } = useMastered();
const stats = useSessionStats();

// ---------- 逐词拆解 ----------
const { isReady, load, lookup } = useWordInfo();

const cards = computed(() => {
  // 依赖 isReady，词表加载完成后重新计算
  if (!isReady.value) return [];
  const statement = courseStore.currentStatement;
  if (!statement) return [];
  return buildWordCards(statement.english, statement.soundmark, lookup);
});

const thesis = computed(() => courseStore.currentStatement?.chinese || "");
const thesisLength = computed(() => thesis.value.length);

// ---------- 上一题 ----------
const prevStatement = computed(() => {
  const list = courseStore.currentCourse?.statements;
  const index = courseStore.statementIndex;
  if (!list || index <= 0) return null;
  return list[index - 1] || null;
});

// ---------- 词性配色 ----------
const POS_COLORS: Record<string, string> = {
  动词: "#6d4aff",
  形容词: "#0d9a9a",
  名词: "#c026d3",
  副词: "#2563eb",
  代词: "#7c8798",
  介词: "#7c8798",
  连词: "#7c8798",
  冠词: "#94a3b8",
  助动词: "#8b5cf6",
  数词: "#0ea5e9",
  感叹词: "#f59e0b",
  缩写: "#94a3b8",
};

function posColor(pos: string) {
  return POS_COLORS[pos] || "#7c8798";
}

// ---------- 操作 ----------
function goToPreviousQuestion() {
  courseStore.toPreviousStatement();
  showQuestion();
}

function skipQuestion() {
  courseStore.toNextStatement();
  showQuestion();
}

registerShortcutKeyForNextQuestion();

function usePlayEnglishSound() {
  const { playSound } = useCurrentStatementEnglishSound();
  const { isAutoPlaySound } = useAutoPronunciation();

  onMounted(() => {
    // 答对的那一刻已经用独立音轨读过一遍了，这里别再重播
    if (isAutoPlaySound() && !recentlyPlayedDetached()) {
      playSound();
    }
  });

  return {
    handlePlayEnglishSound() {
      playSound();
    },
  };
}

const { handlePlayEnglishSound } = usePlayEnglishSound();

function registerShortcutKeyForNextQuestion() {
  function handleKeydown(e: KeyboardEvent) {
    e.preventDefault(); // 阻止到下一个页面的默认按键动作
    goToNextQuestion();
  }
  onMounted(() => {
    registerShortcut(" ", handleKeydown);
    registerShortcut("enter", handleKeydown);
    load();
  });

  onUnmounted(() => {
    cancelShortcut(" ", handleKeydown);
    cancelShortcut("enter", handleKeydown);
  });
}
</script>

<style scoped>
.answer-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: 0 24px;
}

/* 上一题 */
.prev-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 20px;
  font-size: 12.5px;
  color: #5f83a0;
}

.prev-label {
  color: #7b9ab3;
}

.prev-sep {
  color: #a8c4d8;
}

.prev-en {
  color: #4a7593;
}

.prev-check {
  width: 12px;
  height: 12px;
  color: #35b56a;
}

.prev-cn {
  color: #4a7593;
}

/* 中文主句 */
.thesis-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 30px;
}

.thesis {
  font-size: 48px;
  line-height: 1.32;
  font-weight: 700;
  letter-spacing: 3px;
  color: #16293a;
  text-align: center;
}

.thesis.is-long {
  font-size: 36px;
  letter-spacing: 1.5px;
}

.sound-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-left: 12px;
  border-radius: 999px;
  color: #4a7593;
  opacity: 0;
  transition: opacity 0.18s ease;
}

.thesis-wrap:hover .sound-btn {
  opacity: 0.75;
}

.sound-btn:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.7);
}

/* 单词行 */
.word-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: 56px;
  margin-top: 34px;
  width: 100%;
}

.word-row.is-dense {
  gap: 34px;
}

.word-col {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 70px;
  /* 给绝对定位的音标与释义留出位置，使列宽只由英文单词决定 */
  padding-bottom: 50px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.word-col:hover {
  transform: translateY(-2px);
}

.pos-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 12px;
  margin-bottom: 7px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.8px;
  color: #fff;
  white-space: nowrap;
}

.pos-tag-empty {
  background-color: transparent;
}

.word-en {
  font-family: Georgia, "Times New Roman", "Songti SC", serif;
  font-size: 46px;
  font-weight: 700;
  line-height: 1.12;
  color: #17493b;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.is-dense .word-en {
  font-size: 34px;
}

.word-rule {
  width: 100%;
  height: 1.5px;
  margin-top: 8px;
  background-color: rgba(23, 73, 59, 0.38);
}

.word-phonetic {
  position: absolute;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  font-size: 13px;
  letter-spacing: 0.4px;
  color: #5c7f99;
  white-space: nowrap;
}

.word-cn {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.3;
  color: #17493b;
  white-space: nowrap;
}

.is-dense .word-cn {
  font-size: 15px;
}

/* 统计 */
.stat-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-top: 40px;
}

.stat-pill {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 8px 20px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.55);
  font-size: 13.5px;
  color: #2c5d7c;
  white-space: nowrap;
}

.stat-pill b {
  font-size: 17px;
  font-weight: 700;
  color: #12293c;
  font-variant-numeric: tabular-nums;
}

/* 操作 */
.action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 13px;
  margin-top: 26px;
  padding-bottom: 40px;
}

.pill-btn {
  display: inline-flex;
  align-items: center;
  padding: 9px 25px;
  border-radius: 9px;
  background-color: rgba(255, 255, 255, 0.88);
  font-size: 15px;
  color: #17493b;
  box-shadow: 0 1px 2px rgba(23, 73, 59, 0.08);
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.pill-btn:hover {
  background-color: #fff;
}

.pill-btn:active {
  transform: scale(0.98);
}

.star-icon {
  width: 15px;
  height: 15px;
  margin-right: 5px;
}

.primary-btn {
  padding: 9px 30px;
  border-radius: 9px;
  background-color: #2fb344;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 2px 6px rgba(47, 179, 68, 0.28);
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.primary-btn:hover {
  background-color: #29a03c;
}

.primary-btn:active {
  transform: scale(0.98);
}

@media (max-width: 720px) {
  .thesis {
    font-size: 30px;
  }
  .word-en {
    font-size: 28px;
  }
  .word-row {
    gap: 26px;
  }
}
</style>
