import { usePronunciation } from "~/composables/user/pronunciation";

/**
 * 发音播放
 * ------------------------------------------------------------
 * 主音源是后端 /tts/speak（微软神经语音，整句端到端合成），失败时按
 * 三级兜底：
 *   1. 后端合成不可用 → 换有道 dictvoice（单词拼接，但能出声）
 *   2. 有道也失败 → 浏览器 Web Speech API（离线可用）
 *   3. 都不可用 → 静默（不再白等网络超时）
 *
 * 有道合成失败的场景（长句、人名、全大写、随机 500）仍然会被记忆下来，
 * 下次直接跳过它，省掉一次网络往返。
 */

// 便于测试
// 后面不使用 audio 后也可以不破坏业务逻辑
const audio = new Audio();

/** 当前曲目对应的文本，供兜底朗读使用 */
let currentText = "";
/** 当前曲目的备选音源（有道），主音源合成失败时换它 */
let currentFallback = "";

export function updateSource(src: string, text = "", fallbackSrc = "") {
  currentText = text || textFromSrc(src);
  currentFallback = fallbackSrc;
  audio.src = src;
  audio.load();
}

/** 有时候只给了 src，从查询串里把文本捞回来 */
function textFromSrc(src: string): string {
  try {
    const base = typeof location === "undefined" ? "http://localhost" : location.href;
    return new URL(src, base).searchParams.get("audio") ?? "";
  } catch {
    return "";
  }
}

// ---------------- Web Speech API 兜底 ----------------

function speechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

const voiceCacheMap = new Map<string, SpeechSynthesisVoice | null>();
let voiceLoaded = false;

function pickVoice(langPrefix: string): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  if (voiceLoaded && voiceCacheMap.has(langPrefix)) return voiceCacheMap.get(langPrefix) ?? null;

  const voices = window.speechSynthesis.getVoices() ?? [];
  if (voices.length === 0) return null; // 还没加载好，交给 onvoiceschanged

  const matched = voices.filter((v) => new RegExp(`^${langPrefix}([-_]|$)`, "i").test(v.lang));
  const picked =
    matched.find((v) => /google us english/i.test(v.name)) ??
    matched.find((v) => /(aria|zira|jenny|guy|david|samantha|natural)/i.test(v.name)) ??
    matched.find((v) => new RegExp(`${langPrefix}[-_]US`, "i").test(v.lang)) ??
    matched[0] ??
    null;

  voiceCacheMap.set(langPrefix, picked);
  voiceLoaded = true;
  return picked;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  // 语音列表是异步加载的，加载完重置缓存
  window.speechSynthesis.onvoiceschanged = () => {
    voiceLoaded = false;
    voiceCacheMap.clear();
  };
}

/** 用浏览器语音朗读（不依赖网络） */
export function speakWithBrowser(
  text: string,
  options?: { rate?: number; times?: number },
): boolean {
  const content = (text ?? "").trim();
  if (!speechSupported() || !content) return false;

  const synth = window.speechSynthesis;
  synth.cancel();

  const rate = Math.min(2, Math.max(0.5, options?.rate ?? 1));
  let remaining = Math.max(1, options?.times ?? 1);

  // 句子本身是中文（导入数据填错列时会出现）就用中文语音，别用英文腔念中文
  const isChinese = /[\u4e00-\u9fff]/.test(content);
  const lang = isChinese ? "zh-CN" : "en-US";

  const speakOnce = () => {
    const utterance = new window.SpeechSynthesisUtterance(content);
    utterance.lang = lang;
    utterance.rate = rate;
    const voice = pickVoice(isChinese ? "zh" : "en");
    if (voice) utterance.voice = voice;

    remaining -= 1;
    if (remaining > 0) utterance.onend = speakOnce;

    synth.speak(utterance);
  };

  speakOnce();
  return true;
}

export function stopBrowserSpeech() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** 有道合成失败过的句子，直接走本地朗读 */
const failedTexts = new Set<string>();
/** 连续失败后，一段时间内整体改用本地朗读，避免每次都先等网络失败 */
let preferBrowserUntil = 0;
const PREFER_BROWSER_WINDOW = 5 * 60 * 1000;

function markAudioFailed(text: string) {
  if (text) {
    if (failedTexts.size > 300) failedTexts.clear();
    failedTexts.add(text);
  }
  if (failedTexts.size >= 3) preferBrowserUntil = Date.now() + PREFER_BROWSER_WINDOW;
}

/** 供调试/测试：清空失败记忆 */
export function resetAudioFallback() {
  failedTexts.clear();
  preferBrowserUntil = 0;
}

// ---------------- 词发音（答案页点单词） ----------------

const { getPronunciationUrl, getFallbackPronunciationUrl } = usePronunciation();

export function usePlayWordSound() {
  const wordAudio = new Audio();
  let lastWord = "";
  let isPlaying = false;
  let fallbackTried = false;

  wordAudio.onplay = () => {
    isPlaying = true;
  };

  wordAudio.onended = () => {
    isPlaying = false;
  };

  /**
   * 单词的主音源用有道：它是词典里的真人录音，单个词发音最准，而且
   * 命中浏览器缓存时是 0 延迟。句子才需要神经语音来解决「拼接感」。
   * 有道读不出来的词（人名之类）再退到服务端神经语音，最后退浏览器语音。
   */
  function playWordWithFallback() {
    const sentenceUrl = getPronunciationUrl(lastWord);
    if (!sentenceUrl) {
      speakWithBrowser(lastWord);
      return;
    }
    wordAudio.src = sentenceUrl;
    wordAudio.play()?.catch(() => speakWithBrowser(lastWord));
  }

  wordAudio.onerror = () => {
    if (fallbackTried) {
      speakWithBrowser(lastWord);
      return;
    }
    fallbackTried = true;
    playWordWithFallback();
  };

  function handlePlayWordSound(word: string) {
    if (isPlaying && lastWord === word) {
      // skip
      return;
    }
    lastWord = word;
    fallbackTried = false;
    wordAudio.src = getFallbackPronunciationUrl(word) || getPronunciationUrl(word);
    wordAudio.play()?.catch((error: DOMException) => {
      // 自动播放策略拦截不算音源失败，别触发兜底
      if (error?.name === "NotAllowedError") return;
      if (fallbackTried) return;
      fallbackTried = true;
      playWordWithFallback();
    });
  }

  return {
    handlePlayWordSound,
  };
}

export interface PlayOptions {
  times?: number;
  rate?: number;
  interval?: number;
}

const DefaultPlayOptions = {
  times: 1,
  rate: 1,
  interval: 500,
};

export function play(playOptions?: PlayOptions) {
  const { times, rate, interval } = Object.assign({}, DefaultPlayOptions, playOptions);

  const text = currentText;

  // 没有文本就没什么可读的，避免去请求 "audio=undefined"
  if (!text.trim()) return () => {};

  // 已知这段读不出来 / 有道整体不可用 → 直接用浏览器语音
  if (Date.now() < preferBrowserUntil || failedTexts.has(text)) {
    audio.pause();
    speakWithBrowser(text, { rate, times });
    return stopBrowserSpeech;
  }

  let usingBrowserSpeech = false;
  let usingFallbackAudio = false;
  let started = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let guardId: ReturnType<typeof setTimeout> | undefined;

  const fallbackToBrowser = () => {
    if (usingBrowserSpeech) return;
    usingBrowserSpeech = true;
    markAudioFailed(text);
    speakWithBrowser(text, { rate, times });
  };

  /**
   * 主音源（服务端神经语音）失败 → 先换有道，再换浏览器语音。
   * 换源后要重新计一次超时：有道同样可能卡住或返回 500。
   */
  const handleAudioError = () => {
    if (!usingFallbackAudio && currentFallback) {
      usingFallbackAudio = true;
      started = false;
      audio.src = currentFallback;
      audio.load();
      audio.playbackRate = rate;
      audio.play()?.catch((error: DOMException) => {
        if (error?.name === "NotAllowedError") return;
        fallbackToBrowser();
      });
      clearTimeout(guardId);
      guardId = setTimeout(() => {
        if (started || audio.readyState >= 2) return;
        fallbackToBrowser();
      }, 2200);
      return;
    }
    fallbackToBrowser();
  };

  // 一旦真的开始出声，就不用再兜底了（注意：不能拿 paused 判断，
  // 短句播完时 paused 也是 true，会把「已播完」误判成「没出声」）
  const handlePlaying = () => {
    started = true;
    clearTimeout(guardId);
  };

  audio.addEventListener("error", handleAudioError);
  audio.addEventListener("playing", handlePlaying);

  audio.playbackRate = rate;
  const playPromise = audio.play();
  playPromise?.catch?.((error: DOMException) => {
    // 浏览器自动播放策略拦截（比如进页面时自动朗读，还没有用户手势），
    // 这不是「有道合成失败」，不能记进失败名单，否则之后点按钮也会一直走本地语音
    if (error?.name === "NotAllowedError") return;
    fallbackToBrowser();
  });

  // 网络卡住时也别让用户干等：2.2 秒还没拿到可播放的数据才切本地
  // （用 readyState 判断，而不是 playing 事件——部分环境/无音频设备时
  //   playing 事件可能不触发，但音频其实已经在正常播放）
  guardId = setTimeout(() => {
    if (started || audio.readyState >= 2) return;
    fallbackToBrowser();
  }, 2200);

  if (times > 1) {
    audio.addEventListener("ended", handleEnded, false);
  }

  let index = 1;
  function handleEnded() {
    timeoutId = setTimeout(() => {
      if (index < times) {
        audio.play()?.catch?.(() => fallbackToBrowser());
        index++;
      } else {
        index = 1;
        audio.removeEventListener("ended", handleEnded);
      }
    }, interval);
  }

  return () => {
    clearTimeout(timeoutId);
    clearTimeout(guardId);
    audio.removeEventListener("error", handleAudioError);
    audio.removeEventListener("playing", handlePlaying);
    audio.pause();
    audio.currentTime = 0;
    audio.removeEventListener("ended", handleEnded);
    if (usingBrowserSpeech) stopBrowserSpeech();
  };
}
