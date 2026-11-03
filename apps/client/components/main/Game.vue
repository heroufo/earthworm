<template>
  <div class="game-mode">
    <template v-if="isDictationMode()">
      <ModeDictationMode />
    </template>
    <template v-else-if="isChineseToEnglishMode()">
      <ModeChineseToEnglishMode />
    </template>
  </div>

  <!-- 学习页不再显示计时与快捷键提示条，功能与快捷键仍然有效 -->
  <div class="game-timer">
    <MainLearningTimer v-if="isAuthenticated()"></MainLearningTimer>
  </div>
  <div class="game-tips">
    <MainTips />
  </div>
  <MainSummary />
  <MainShare />
  <GamePauseModal v-if="isAuthenticated()"></GamePauseModal>
  <MainGameSettingModal />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";

import GamePauseModal from "~/components/main/GamePauseModal.vue";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useGamePlayMode } from "~/composables/user/gamePlayMode";
import { isAuthenticated } from "~/services/auth";
import { useGameStore } from "~/store/game";

const { isChineseToEnglishMode, isDictationMode } = useGamePlayMode();
const gameStore = useGameStore();

onMounted(() => {
  courseTimer.reset();
  gameStore.startGame();
});

onUnmounted(() => {
  gameStore.exitGame();
});
</script>

<style scoped>
/* 计时器与快捷键提示条在图片版式里没有，隐藏但仍保留其逻辑与快捷键注册 */
.game-timer,
.game-tips {
  display: none;
}

.game-mode {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
}
</style>
