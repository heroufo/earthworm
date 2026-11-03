import { ref } from "vue";

import { getApiBase } from "~/api/http";

/**
 * 发音源
 * ------------------------------------------------------------
 * 这里现在请求后端 /tts/speak，由微软神经语音（Edge Read Aloud，
 * 与 Azure TTS 同一套声学模型）合成整句音频。相比原来的有道
 * dictvoice（单词录音拼接）有三个好处：
 *   1. 整句端到端合成，有自然的升降调、连读、重音和停顿
 *   2. 长句、人名、全大写都能读，不会再 500 没声音
 *   3. 结果按文本哈希缓存在服务端，预生成后是纯静态文件
 *
 * getFallbackPronunciationUrl 保留有道地址，作为后端合成不可用时的
 * 第二层兜底（第三层是浏览器 Web Speech API）。
 */

export enum PronunciationType {
  American = "American",
  British = "British",
}

export const pronunciationLabels: { [key in PronunciationType]: string } = {
  [PronunciationType.American]: "美音",
  [PronunciationType.British]: "英音",
};

/** 每种口音对应的默认神经音色，与后端 TTS_VOICES 保持一致 */
export const pronunciationVoices: { [key in PronunciationType]: string } = {
  [PronunciationType.American]: "en-US-JennyNeural",
  [PronunciationType.British]: "en-GB-SoniaNeural",
};

export const ttsVoices = [
  { id: "en-US-JennyNeural", label: "Jenny · 美音女声", note: "温和耐听（默认）" },
  { id: "en-US-AvaNeural", label: "Ava · 美音女声", note: "最自然、最亲切" },
  { id: "en-US-EmmaNeural", label: "Emma · 美音女声", note: "清晰明亮，适合教学" },
  { id: "en-US-AriaNeural", label: "Aria · 美音女声", note: "播报感强，字正腔圆" },
  { id: "en-US-AndrewNeural", label: "Andrew · 美音男声", note: "温暖自然，最像真人" },
  { id: "en-US-BrianNeural", label: "Brian · 美音男声", note: "沉稳，教材录音感" },
  { id: "en-US-GuyNeural", label: "Guy · 美音男声", note: "标准美式，语速平稳" },
  { id: "en-GB-SoniaNeural", label: "Sonia · 英音女声", note: "英式标准音，吐字清楚" },
  { id: "en-GB-RyanNeural", label: "Ryan · 英音男声", note: "英式播音腔" },
];

const PRONUNCIATION_TYPE = "pronunciationType";
const TTS_VOICE_KEY = "ttsVoice";
const pronunciation = ref<PronunciationType>(PronunciationType.American); // 默认美音

export function usePronunciation() {
  loadCache();

  function loadCache() {
    const type = getStore() || pronunciation.value;
    setStore(type);
  }

  function setStore(value: PronunciationType) {
    pronunciation.value = value;
    localStorage.setItem(PRONUNCIATION_TYPE, value);
  }

  function getStore(): PronunciationType {
    return localStorage.getItem(PRONUNCIATION_TYPE) as PronunciationType;
  }

  function getPronunciationType(): number {
    return pronunciation.value === PronunciationType.American ? 2 : 1;
  }

  function getPronunciationOptions() {
    return Object.entries(pronunciationLabels).map(([key, value]) => {
      return {
        label: value,
        value: key,
      };
    });
  }

  /** 当前使用的神经音色：优先用户在设置里单独指定的，其次按口音取默认 */
  function getTtsVoice(): string {
    try {
      const custom = localStorage.getItem(TTS_VOICE_KEY);
      if (custom) return custom;
    } catch {
      /* 隐私模式下读不到 localStorage，忽略 */
    }
    return pronunciationVoices[pronunciation.value] ?? pronunciationVoices.American;
  }

  function setTtsVoice(voice: string) {
    try {
      if (voice) localStorage.setItem(TTS_VOICE_KEY, voice);
      else localStorage.removeItem(TTS_VOICE_KEY);
    } catch {
      /* 忽略 */
    }
  }

  /** 服务端合成地址（主音源） */
  function getPronunciationUrl(english: string | undefined): string {
    const text = (english ?? "").trim();
    if (!text) return "";
    // apiBase 一般在 http 插件里初始化；取不到时退回本地默认端口
    const base = getApiBase() || "http://localhost:3001";
    const params = new URLSearchParams({ voice: getTtsVoice(), text });
    return `${base}/tts/speak?${params.toString()}`;
  }

  /** 有道地址（兜底用）：仍是单词拼接，但至少能出声 */
  function getFallbackPronunciationUrl(english: string | undefined): string {
    const text = (english ?? "").trim();
    if (!text) return "";
    return `https://dict.youdao.com/dictvoice?type=${getPronunciationType()}&audio=${encodeURIComponent(
      text,
    )}`;
  }

  // 切换发音
  function togglePronunciation(type: PronunciationType) {
    if (type !== pronunciation.value) setStore(type);
  }

  return {
    pronunciation,
    getPronunciationOptions,
    getPronunciationUrl,
    getFallbackPronunciationUrl,
    getTtsVoice,
    setTtsVoice,
    togglePronunciation,
  };
}
