<template>
  <div class="practice">
    <!-- 顶栏 -->
    <header class="p-header">
      <button
        class="back-btn"
        @click="goBack"
      >
        <UIcon
          name="i-ph-arrow-left"
          class="back-icon"
        />
        返回收藏
      </button>

      <div class="p-progress">
        {{ finished ? "本轮完成" : `第 ${index + 1} 题 / 共 ${items.length} 题` }}
      </div>

      <div class="p-accuracy">
        正确率 <b>{{ accuracy }}%</b>
      </div>
    </header>

    <div class="p-bar">
      <span :style="{ width: `${progressPercent}%` }" />
    </div>

    <main class="p-stage">
      <div
        v-if="isLoading"
        class="p-tip"
      >
        正在准备题目…
      </div>

      <div
        v-else-if="!items.length"
        class="p-tip"
      >
        没有可练习的句子，请返回收藏重新选择。
      </div>

      <!-- 本轮汇总 -->
      <section
        v-else-if="finished"
        class="summary card"
      >
        <div class="summary-title">本轮练习完成</div>
        <div class="summary-rate">{{ accuracy }}%</div>
        <div class="summary-sub">
          共 {{ items.length }} 题 · 答对 {{ correctCount }} · 答错 {{ wrongCount }}
        </div>
        <div class="summary-actions">
          <button
            class="pill"
            @click="restart"
          >
            再练一次
          </button>
          <button
            class="pill primary"
            @click="goBack"
          >
            返回收藏
          </button>
        </div>
      </section>

      <!-- 答题 -->
      <section
        v-else
        class="card"
      >
        <div class="q-label">
          {{ current.chinese ? "看中文，写出英文" : "听写：先听发音，再拼出整句" }}
        </div>

        <div
          v-if="current.chinese"
          class="q-cn"
        >
          {{ current.chinese }}
        </div>
        <div
          v-else
          class="q-empty"
        >
          <UIcon
            name="i-ph-headphones"
            class="q-empty-icon"
          />
        </div>

        <div class="q-sound-row">
          <button
            class="sound-btn"
            title="播放整句发音（快捷键 2）"
            @click="speakCurrent"
          >
            <UIcon
              name="i-ph-speaker-simple-high"
              class="sound-icon"
            />
            播放发音
          </button>
          <span
            v-if="isAnswered && current.soundmark"
            class="q-phonetic"
            >{{ current.soundmark }}</span
          >
        </div>

        <input
          ref="inputEl"
          v-model="answer"
          class="answer-input"
          :class="{ 'is-right': isAnswered && lastCorrect, 'is-wrong': isAnswered && !lastCorrect }"
          :disabled="isAnswered"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="在这里输入英文，回车提交"
          @keydown.enter.prevent="handleEnter"
        />

        <!-- 判分结果 -->
        <div
          v-if="isAnswered"
          class="result"
          :class="lastCorrect ? 'ok' : 'no'"
        >
          <div class="result-head">
            <UIcon
              :name="lastCorrect ? 'i-ph-check-circle-bold' : 'i-ph-x-circle-bold'"
              class="result-icon"
            />
            {{ lastCorrect ? "答对了" : "答错了" }}
          </div>
          <div
            v-if="!lastCorrect"
            class="result-line"
          >
            <span class="result-key">你的答案</span>
            <span class="result-wrong">{{ answerText }}</span>
          </div>
          <div class="result-line">
            <span class="result-key">正确答案</span>
            <span class="result-right">{{ current.english }}</span>
          </div>
          <div
            v-if="current.chinese"
            class="result-line"
          >
            <span class="result-key">中文</span>
            <span class="result-cn">{{ current.chinese }}</span>
          </div>
        </div>

        <div class="actions">
          <template v-if="!isAnswered">
            <button
              class="pill ghost"
              @click="revealAnswer"
            >
              不会，看答案
            </button>
            <button
              class="pill primary"
              :disabled="!answerText"
              @click="submit"
            >
              提交
            </button>
          </template>
          <button
            v-else
            class="pill primary"
            @click="next"
          >
            {{ isLast ? "查看结果" : "下一题" }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#imports";
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";

import type { PracticeItem } from "~/api/mastered-elements";
import { fetchPracticeItems } from "~/api/mastered-elements";
import { speakWithBrowser } from "~/composables/main/englishSound/audio";
import { usePronunciation } from "~/composables/user/pronunciation";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

definePageMeta({ layout: "game" });

const route = useRoute();
const { getPronunciationUrl, getFallbackPronunciationUrl } = usePronunciation();

const items = ref<PracticeItem[]>([]);
const isLoading = ref(true);
const index = ref(0);
const answer = ref("");
const isAnswered = ref(false);
const lastCorrect = ref(false);
const correctCount = ref(0);
const wrongCount = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

let audio: HTMLAudioElement | null = null;

const current = computed<PracticeItem>(
  () => items.value[index.value] ?? { id: "", english: "", chinese: "", soundmark: "" },
);
const isLast = computed(() => index.value >= items.value.length - 1);
const finished = computed(() => items.value.length > 0 && index.value >= items.value.length);
const answerText = computed(() => answer.value.trim());
const progressPercent = computed(() => {
  if (!items.value.length) return 0;
  return Math.round((index.value / items.value.length) * 100);
});
const accuracy = computed(() => {
  const done = correctCount.value + wrongCount.value;
  if (!done) return 0;
  return Math.round((correctCount.value / done) * 100);
});

// 判分：忽略大小写、首尾空格、多余空格和句尾标点
function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function speak(text: string) {
  if (!text || typeof Audio === "undefined") return;
  audio?.pause();
  const el = new Audio(getPronunciationUrl(text));
  audio = el;

  // 三级兜底：服务端神经语音 → 有道 → 浏览器语音
  let usedFallback = false;
  const goFallback = () => {
    if (usedFallback) {
      speakWithBrowser(text);
      return;
    }
    usedFallback = true;
    const fallback = getFallbackPronunciationUrl(text);
    if (!fallback) {
      speakWithBrowser(text);
      return;
    }
    el.src = fallback;
    el.play().catch(() => speakWithBrowser(text));
  };

  el.onerror = goFallback;
  el.play().catch((error: DOMException) => {
    if (error?.name === "NotAllowedError") return;
    goFallback();
  });
}

function speakCurrent() {
  speak(current.value.english);
}

async function focusInput() {
  await nextTick();
  inputEl.value?.focus();
}

function submit() {
  if (isAnswered.value || !answerText.value) return;
  const ok = normalize(answerText.value) === normalize(current.value.english);
  lastCorrect.value = ok;
  isAnswered.value = true;
  if (ok) {
    correctCount.value += 1;
    speak(current.value.english);
  } else {
    wrongCount.value += 1;
  }
}

function revealAnswer() {
  if (isAnswered.value) return;
  lastCorrect.value = false;
  isAnswered.value = true;
  wrongCount.value += 1;
  speak(current.value.english);
}

function next() {
  index.value += 1;
  answer.value = "";
  isAnswered.value = false;
  lastCorrect.value = false;
  audio?.pause();
  if (!finished.value) focusInput();
}

function restart() {
  index.value = 0;
  correctCount.value = 0;
  wrongCount.value = 0;
  answer.value = "";
  isAnswered.value = false;
  lastCorrect.value = false;
  focusInput();
}

function handleEnter() {
  if (isAnswered.value) next();
  else submit();
}

function goBack() {
  audio?.pause();
  navigateTo("/favorites");
}

onMounted(async () => {
  const raw = route.query.ids;
  const ids = (Array.isArray(raw) ? raw.join(",") : raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!ids.length) {
    isLoading.value = false;
    return;
  }

  try {
    const result = await fetchPracticeItems(ids);
    items.value = result.filter((item) => !!item.english);
  } catch {
    items.value = [];
  } finally {
    isLoading.value = false;
  }

  registerShortcut("2", (e) => {
    // 输入框里按 2 是正常打字，不触发发音
    if (e.target instanceof HTMLInputElement) return;
    speakCurrent();
  });
  await focusInput();
});

onUnmounted(() => {
  cancelShortcut("2");
  audio?.pause();
  audio = null;
});
</script>

<style scoped>
.practice {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 0 20px 48px;
}

/* 顶栏 */
.p-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  padding: 18px 0 12px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px 7px 11px;
  border: 1px solid rgba(23, 73, 59, 0.16);
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.7);
  color: #1c4a3c;
  font-size: 13.5px;
  font-weight: 600;
  transition:
    background-color 0.16s ease,
    transform 0.16s ease;
}

.back-btn:hover {
  background-color: #ffffff;
  transform: translateY(-1px);
}

.back-icon {
  width: 16px;
  height: 16px;
}

.p-progress {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: #2c5f74;
}

.p-accuracy {
  font-size: 13px;
  color: #4d81a5;
}

.p-accuracy b {
  font-size: 15px;
  color: #17493b;
}

/* 进度条 */
.p-bar {
  width: 100%;
  max-width: 880px;
  height: 4px;
  margin: 0 auto 22px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.55);
  overflow: hidden;
}

.p-bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #6d4aff, #4dc3a8);
  transition: width 0.28s ease;
}

/* 舞台 */
.p-stage {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
}

.p-tip {
  padding: 80px 0;
  text-align: center;
  font-size: 15px;
  color: #4d81a5;
}

.card {
  width: 100%;
  padding: 30px 34px 26px;
  border-radius: 22px;
  background-color: rgba(255, 255, 255, 0.88);
  box-shadow: 0 14px 40px rgba(27, 74, 105, 0.12);
  backdrop-filter: blur(6px);
}

.q-label {
  font-size: 12.5px;
  letter-spacing: 1px;
  color: #7fa3bb;
}

.q-cn {
  margin-top: 14px;
  font-family: Georgia, "Songti SC", "Microsoft YaHei", serif;
  font-size: 38px;
  line-height: 1.4;
  color: #17493b;
}

.q-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 92px;
  margin-top: 10px;
  border-radius: 16px;
  background-color: rgba(179, 217, 242, 0.35);
}

.q-empty-icon {
  width: 40px;
  height: 40px;
  color: #7fa3bb;
}

.q-sound-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
}

.sound-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border: 1px solid rgba(23, 73, 59, 0.16);
  border-radius: 999px;
  background-color: #ffffff;
  color: #1c4a3c;
  font-size: 13px;
  font-weight: 600;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.sound-btn:hover {
  border-color: rgba(109, 74, 255, 0.45);
  box-shadow: 0 4px 12px rgba(109, 74, 255, 0.14);
}

.sound-icon {
  width: 16px;
  height: 16px;
}

.q-phonetic {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 16px;
  letter-spacing: 0.4px;
  color: #4d81a5;
}

/* 输入框 */
.answer-input {
  width: 100%;
  margin-top: 20px;
  padding: 14px 16px;
  border: 1.5px solid #d8e6ef;
  border-radius: 14px;
  background-color: #ffffff;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 22px;
  line-height: 1.5;
  color: #17493b;
  outline: none;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.answer-input::placeholder {
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 14px;
  color: #a9bcc9;
}

.answer-input:focus {
  border-color: #6d4aff;
  box-shadow: 0 0 0 3px rgba(109, 74, 255, 0.12);
}

.answer-input.is-right {
  border-color: #2fb37a;
  background-color: #f4fdf9;
}

.answer-input.is-wrong {
  border-color: #e2725b;
  background-color: #fff8f6;
}

/* 结果 */
.result {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: 14px;
  background-color: #f6fafc;
}

.result.ok {
  background-color: #f2fbf6;
}

.result.no {
  background-color: #fff6f4;
}

.result-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  color: #2fb37a;
}

.result.no .result-head {
  color: #d9603f;
}

.result-icon {
  width: 17px;
  height: 17px;
}

.result-line {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  font-size: 15px;
  line-height: 1.5;
}

.result-key {
  width: 62px;
  flex-shrink: 0;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 12.5px;
  color: #93a9b8;
  padding-top: 2px;
}

.result-right {
  font-family: Georgia, "Times New Roman", serif;
  color: #17493b;
  font-weight: 600;
}

.result-wrong {
  font-family: Georgia, "Times New Roman", serif;
  color: #c2705e;
  text-decoration: line-through;
}

.result-cn {
  color: #46636f;
}

/* 按钮 */
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.pill {
  min-width: 104px;
  height: 40px;
  padding: 0 20px;
  border-radius: 999px;
  border: 1px solid rgba(23, 73, 59, 0.16);
  background-color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  color: #1c4a3c;
  transition:
    background-color 0.16s ease,
    opacity 0.16s ease,
    transform 0.16s ease;
}

.pill:hover:not(:disabled) {
  transform: translateY(-1px);
}

.pill.ghost {
  color: #6a7f8c;
  border-color: #dbe7ef;
  background-color: rgba(255, 255, 255, 0.7);
}

.pill.primary {
  border-color: transparent;
  background-color: #6d4aff;
  color: #ffffff;
  box-shadow: 0 6px 18px rgba(109, 74, 255, 0.28);
}

.pill.primary:hover:not(:disabled) {
  background-color: #5b38f0;
}

.pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

/* 汇总 */
.summary {
  text-align: center;
  padding: 40px 34px 34px;
}

.summary-title {
  font-size: 15px;
  letter-spacing: 1px;
  color: #7fa3bb;
}

.summary-rate {
  margin-top: 10px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 64px;
  line-height: 1;
  color: #17493b;
}

.summary-sub {
  margin-top: 14px;
  font-size: 14px;
  color: #4d81a5;
}

.summary-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 26px;
}

@media (max-width: 640px) {
  .practice {
    padding: 0 14px 40px;
  }

  .p-stage {
    justify-content: flex-start;
    padding-top: 6px;
  }

  .p-header {
    padding: 14px 0 10px;
  }

  .back-btn {
    padding: 6px 12px 6px 9px;
    font-size: 12.5px;
  }

  .card {
    padding: 22px 18px 20px;
    border-radius: 18px;
  }

  .q-cn {
    font-size: 28px;
  }

  .answer-input {
    font-size: 18px;
  }

  .actions {
    flex-direction: column-reverse;
  }

  .pill {
    width: 100%;
  }
}
</style>
