<template>
  <div class="question-panel">
    <h1
      class="thesis"
      :class="{ 'is-long': chinese.length > 14 }"
    >
      {{ chinese }}
    </h1>
    <MainQuestionInput />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";

import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import { useAutoPlayEnglish } from "~/composables/user/sound";
import { useCourseStore } from "~/store/course";

const courseStore = useCourseStore();
const { playSound } = useCurrentStatementEnglishSound();
const { isAutoPlayEnglish } = useAutoPlayEnglish();

const chinese = computed(
  () => courseStore.currentStatement?.chinese || "生存还是毁灭，这是一个问题",
);

onMounted(() => {
  handleAutoPlayEnglish();
});

watch(
  () => courseStore.currentStatement,
  () => {
    handleAutoPlayEnglish();
  },
);

function handleAutoPlayEnglish() {
  if (isAutoPlayEnglish()) {
    playSound();
  }
}
</script>

<style scoped>
.question-panel {
  width: 100%;
  max-width: 980px;
  padding: 0 24px;
  text-align: center;
}

.thesis {
  margin: 56px auto 34px;
  font-size: 48px;
  line-height: 1.32;
  font-weight: 700;
  letter-spacing: 3px;
  color: #16293a;
}

.thesis.is-long {
  font-size: 36px;
  letter-spacing: 1.5px;
}

@media (max-width: 720px) {
  .thesis {
    margin: 30px auto 20px;
    font-size: 30px;
  }
}
</style>
