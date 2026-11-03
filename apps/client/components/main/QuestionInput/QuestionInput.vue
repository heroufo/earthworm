<template>
  <div class="quiz-input text-center">
    <div
      class="word-line relative flex flex-wrap justify-center gap-2 transition-all"
      :class="{ 'show-hint': showPhonetic }"
    >
      <template
        v-for="(w, i) in courseStore.words"
        :key="i"
      >
        <div
          v-if="isWord(w)"
          class="word-cell h-[4rem] rounded-[2px] border-b-2 border-solid text-[3em] leading-none transition-all"
          :class="[getWordsClassNames(i), { 'show-hint': showPhonetic }]"
          :style="{ minWidth: `${inputWidth(w)}ch` }"
        >
          {{ findWordById(i)!.userInput }}
          <span
            v-if="showPhonetic"
            class="cell-phonetic"
            >{{ phonetics[i] || "" }}</span
          >
        </div>
        <div
          v-else
          class="h-[4rem] rounded-[2px] text-[3em] leading-none transition-all"
        >
          {{ w }}
        </div>
      </template>
      <input
        lang="en"
        ref="inputEl"
        class="absolute h-full w-full opacity-0"
        type="text"
        v-model="inputValue"
        @keydown="handleKeydown"
        @focus="focusInput"
        @blur="blurInput"
        @dblclick.prevent
        @mousedown="preventCursorMove"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
        autoFocus
      />
    </div>

    <!-- 横线下面的答题辅助：音标提示 / 朗读发音 -->
    <div class="hint-actions">
      <button
        class="hint-btn"
        :class="{ 'is-on': showPhonetic }"
        type="button"
        tabindex="-1"
        :title="showPhonetic ? '隐藏音标提示（1）' : '显示音标提示（1）'"
        @mousedown.prevent
        @click="handleTogglePhonetic"
      >
        <UIcon
          name="i-ph-lightbulb"
          class="hint-icon"
        />
        <span>{{ showPhonetic ? "隐藏音标" : "音标提示" }}</span>
        <kbd class="hint-kbd">1</kbd>
      </button>

      <button
        class="hint-btn"
        type="button"
        tabindex="-1"
        title="朗读整句发音（2）"
        @mousedown.prevent
        @click="handlePlaySound"
      >
        <UIcon
          name="i-ph-speaker-simple-high"
          class="hint-icon"
        />
        <span>朗读发音</span>
        <kbd class="hint-kbd">2</kbd>
      </button>
    </div>

    <div class="mt-12 flex flex-col items-center justify-center gap-4 md:hidden">
      <button
        class="btn btn-outline btn-sm"
        @click="handleSubmitAnswer"
      >
        提交
      </button>
      <div class="flex gap-4">
        <button
          class="btn btn-outline btn-sm"
          @click="handleShowAnswerTip"
        >
          {{ isAnswerTip() ? "隐藏" : "显示" }}答案
        </button>
        <button
          class="btn btn-outline btn-sm"
          @click="handlePlaySound"
        >
          播放声音
        </button>
      </div>
      <MainMasteredBtn></MainMasteredBtn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { toast } from "vue-sonner";

import { courseTimer } from "~/composables/courses/courseTimer";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import { isWord } from "~/composables/main/question";
import { buildWordCards, useWordInfo } from "~/composables/main/wordInfo";
import { useShowWordsWidth } from "~/composables/user/words";
import { useCourseStore } from "~/store/course";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";
import { isWindows } from "~/utils/platform";
import { getWordWidth, useQuestionInput } from "./questionInputHelper";
import { useAnswerError } from "./useAnswerError";
import { useWrapperQuestionInput } from "./useWrapperQuestionInput";

const courseStore = useCourseStore();
const { inputEl, focusing, focusInput, blurInput } = useQuestionInput();
const {
  initializeQuestionInput,
  findWordById,
  isFixMode,
  inputValue,
  submitAnswer,
  handleKeyboardInput,
  setInputValue,
} = useWrapperQuestionInput();
const { isShowWordsWidth } = useShowWordsWidth();
const { toggleAnswerTip, isAnswerTip } = useAnswerTip();
const { resetCloseTip } = useAnswerError();
initializeQuestionInput();
focusInputWhenWIndowFocus();

// ---------- 音标提示 ----------
const { playSound } = useCurrentStatementEnglishSound();
const showPhonetic = ref(false);
const { isReady: isWordInfoReady, load: loadWordInfo, lookup: lookupWord } = useWordInfo();

/** 逐词音标，顺序与输入框中的词一一对应 */
const phonetics = computed(() => {
  if (!isWordInfoReady.value) return [] as string[];
  const statement = courseStore.currentStatement;
  if (!statement) return [];
  return buildWordCards(statement.english, statement.soundmark, lookupWord).map(
    (card) => card.phonetic,
  );
});

function togglePhonetic() {
  showPhonetic.value = !showPhonetic.value;
}

function handleTogglePhonetic(e?: MouseEvent) {
  e?.preventDefault();
  togglePhonetic();
  focusInput();
}

onMounted(() => {
  focusInput();
  resetCloseTip();
  loadWordInfo();
  registerShortcut("1", handlePhoneticShortcut);
  registerShortcut("2", handlePlaySoundShortcut);
});

onUnmounted(() => {
  cancelShortcut("1", handlePhoneticShortcut);
  cancelShortcut("2", handlePlaySoundShortcut);
});

function handlePhoneticShortcut(e: KeyboardEvent) {
  e.preventDefault();
  togglePhonetic();
}

function handlePlaySoundShortcut(e: KeyboardEvent) {
  e.preventDefault();
  playSound();
}

watch(
  () => inputValue.value,
  (val) => {
    setInputValue(val);
    courseTimer.time(String(courseStore.statementIndex));
  },
);

watch(
  () => courseStore.statementIndex,
  () => {
    focusInput();
    resetCloseTip();
    // 换题后收起音标提示，避免直接看到下一题的读音
    showPhonetic.value = false;
  },
);

function focusInputWhenWIndowFocus() {
  const handleFocus = () => {
    focusInput();
  };

  onMounted(() => {
    window.addEventListener("focus", handleFocus);
  });

  onUnmounted(() => {
    window.removeEventListener("focus", handleFocus);
  });
}

function handlePlaySound(e: MouseEvent) {
  e.preventDefault();
  playSound();
  focusInput();
}

function handleShowAnswerTip(e: MouseEvent) {
  e.preventDefault();
  toggleAnswerTip();
}

function handleSubmitAnswer() {
  submitAnswer();
}

function getWordsClassNames(index: number) {
  const word = findWordById(index)!;
  // 当前单词激活 且 聚焦
  if (word.isActive && focusing.value) {
    return "text-[#2f7d5e] border-b-[#2f7d5e]";
  }

  // 当前单词错误 且 聚焦
  if (word.incorrect && focusing.value) {
    // Fix 修复模式添加动画
    return `text-red-500 border-b-red-500 ${isFixMode() && "animate-shake"}`;
  }

  // 默认样式（学习页是浅蓝底，不跟随深色主题）
  return "text-[#6d879b] border-b-[#9cb9cd]";
}

// 输入宽度
function inputWidth(word: string) {
  if (!isShowWordsWidth()) {
    // 不显示对应单词宽度，默认 4 字符宽度
    return 4;
  }

  return getWordWidth(word);
}

// // 中文输入会导致先触发 handleKeydown
// // 但是这时候字符还没有上屏
// // 就会造成触发 submit answer  导致明明答案正确但是不通过的问题
// // 通过检测是否为输入法 来避免按下 enter 后直接触发 submit answer
let isComposing = ref(false);
function handleCompositionStart() {
  isComposing.value = true;
}

function handleCompositionEnd() {
  isComposing.value = false;
}

function handleKeydown(e: KeyboardEvent) {
  // 1 = 音标提示，2 = 朗读发音
  // 英文句子用不到数字键，这里直接截走，避免数字被写进答案；
  // stopPropagation 防止同时触发 window 上注册的同名快捷键
  if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "1" || e.key === "2")) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "1") {
      togglePhonetic();
    } else {
      playSound();
    }
    return;
  }

  // 给 windows 用户添加 ctrl + backspace 删除上一个单词的快捷键
  // 有些浏览器 input 不支持通过 ctrl + backspace 删除 所以自行扩展下
  if (e.code === "Backspace" && e.ctrlKey && isWindows()) {
    e.preventDefault();
    deletePreviousWordOnWin();
    return;
  }

  // 避免在某些中文输入法中，按下 Ctrl 键时，输入法会将当前的预输入字符上屏
  if (e.ctrlKey) {
    e.preventDefault();
    return;
  }

  if (e.code === "Enter" && !isComposing.value) {
    e.stopPropagation();
    submitAnswer();
    return;
  }

  handleKeyboardInput(e);
}

function deletePreviousWordOnWin() {
  var start = inputEl.value!.selectionStart!;
  var end = inputEl.value!.selectionEnd!;
  if (end === 0) return;

  // 删除光标前的所有连续空格
  while (start > 0 && inputValue.value[start - 1] === " ") {
    start--;
  }
  var valueToCursor = inputValue.value.substring(0, start);
  var newEnd = valueToCursor.lastIndexOf(" ") + 1 || 0;
  inputValue.value = inputValue.value.substring(0, newEnd);
  inputEl.value!.setSelectionRange(newEnd, newEnd);
}

function preventCursorMove(event: MouseEvent) {
  // 阻止 mousedown 事件的默认行为
  // 它会改变 input 光标的位置
  event.preventDefault();
  // 只允许 input focus
  focusInput();
}
</script>

<style scoped>
/* 与答案页保持同一套字体：英文用衬线，中文用系统黑体 */
.quiz-input {
  font-family: Georgia, "Times New Roman", "Songti SC", "Microsoft YaHei", "PingFang SC", serif;
}

/* 词行固定预留音标空间，提示开关时按钮不位移 */
.word-line {
  /* 给绝对定位的音标留出位置，音标开关时按钮不位移 */
  padding-bottom: 38px;
}

/* 换行时把行距撑开，避免上一行的音标压到下一行 */
.word-line.show-hint {
  row-gap: 42px;
}

.word-cell {
  position: relative;
}

.cell-phonetic {
  position: absolute;
  left: 50%;
  bottom: -22px;
  transform: translateX(-50%);
  font-family: Georgia, "Times New Roman", "Songti SC", serif;
  font-size: 15px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: 0.3px;
  color: #3d6f93;
  white-space: nowrap;
  pointer-events: none;
  animation: phonetic-in 0.18s ease both;
}

@keyframes phonetic-in {
  from {
    opacity: 0;
    transform: translate(-50%, -5px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

/* 横线下面的两个辅助按钮 */
.hint-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 4px;
}

.hint-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid rgba(140, 180, 205, 0.55);
  background-color: rgba(255, 255, 255, 0.7);
  font-family:
    "Microsoft YaHei",
    "PingFang SC",
    -apple-system,
    "Segoe UI",
    sans-serif;
  font-size: 15px;
  color: #2c5d7c;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.1s ease;
}

.hint-btn:hover {
  background-color: #fff;
  border-color: rgba(96, 152, 186, 0.7);
  color: #17493b;
  box-shadow: 0 3px 10px rgba(45, 110, 150, 0.12);
  transform: translateY(-1px);
}

.hint-btn:active {
  transform: scale(0.98);
}

.hint-btn.is-on {
  background-color: #fff;
  border-color: #7fb3d0;
  color: #17493b;
  box-shadow: 0 0 0 3px rgba(127, 179, 208, 0.16);
}

.hint-icon {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}

.hint-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 5px;
  background-color: rgba(44, 93, 124, 0.1);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: #4a7593;
}

.hint-btn.is-on .hint-kbd {
  background-color: rgba(23, 73, 59, 0.12);
  color: #17493b;
}
</style>
