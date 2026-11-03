import { watchEffect } from "vue";

import type { PlayOptions } from "./audio";
import { useToolbar } from "~/composables/main/dictation";
import { useGamePlayMode } from "~/composables/user/gamePlayMode";
import { usePronunciation } from "~/composables/user/pronunciation";
import { useCourseStore } from "~/store/course";
import { play, speakWithBrowser, updateSource } from "./audio";

const { getPronunciationUrl, getFallbackPronunciationUrl } = usePronunciation();

let lastPronunciationUrl = "";
export function useCurrentStatementEnglishSound() {
  const courseStore = useCourseStore();
  const { toolBarData } = useToolbar();
  const { isDictationMode } = useGamePlayMode();

  watchEffect(() => {
    const word = courseStore.currentStatement?.english;
    const pronunciationUrl = getPronunciationUrl(word);
    if (lastPronunciationUrl !== pronunciationUrl) {
      // 主音源是服务端神经语音，合成失败时退到有道，再退到浏览器语音
      updateSource(pronunciationUrl, word ?? "", getFallbackPronunciationUrl(word));
    }
    lastPronunciationUrl = pronunciationUrl;
  });

  return {
    playSound: (options?: PlayOptions) => {
      if (isDictationMode()) {
        const { times, rate, interval } = toolBarData;
        return play({ times, rate, interval });
      } else {
        return play(options);
      }
    },
  };
}

// 朗读每日一句
export function readOneSentencePerDayAloud(str: string) {
  const pronunciationUrl = getPronunciationUrl(str);
  updateSource(pronunciationUrl, str, getFallbackPronunciationUrl(str));
  play();
}

export function playEnglish(english: string) {
  const pronunciationUrl = getPronunciationUrl(english);
  updateSource(pronunciationUrl, english, getFallbackPronunciationUrl(english));
  play();
}

/**
 * 独立音轨朗读（"答对后朗读"专用）
 * ------------------------------------------------------------
 * 主音源 `audio` 会跟着当前句子变化：答对后如果马上跳下一题，
 * watchEffect 会把 src 换成新句子，正在播的读音会被直接掐掉。
 * 所以这里用一条单独的 Audio 播，翻页不影响它。
 */
let detachedAudio: Audio | null = null;
let detachedPlayedAt = 0;

export function playDetachedEnglish(english: string | undefined) {
  const text = (english ?? "").trim();
  if (!text || typeof Audio === "undefined") return;

  detachedPlayedAt = Date.now();
  try {
    detachedAudio?.pause();
  } catch {
    /* 忽略 */
  }

  const audio = new Audio(getPronunciationUrl(text));
  detachedAudio = audio;
  audio.play().catch((error: DOMException) => {
    // 自动播放策略拦截不算音源失败，别触发兜底
    if (error?.name === "NotAllowedError") return;
    speakWithBrowser(text);
  });
}

/** 刚刚是不是已经用独立音轨读过（避免答案页重复播一遍） */
export function recentlyPlayedDetached(withinMs = 2500) {
  return detachedPlayedAt > 0 && Date.now() - detachedPlayedAt < withinMs;
}
