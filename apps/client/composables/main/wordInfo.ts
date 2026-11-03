import { ref } from "vue";

export interface WordInfo {
  /** 中文词性，如「动词」 */
  pos: string;
  /** 简短中文释义 */
  translation: string;
  /** 词典音标（不带斜杠） */
  phonetic: string;
}

export interface WordCard {
  /** 展示用原词（保留大小写和标点） */
  text: string;
  /** 归一化后的词，用于查词 */
  clean: string;
  /** 带斜杠的音标 */
  phonetic: string;
  pos: string;
  translation: string;
}

type WordInfoTuple = [pos: string, translation: string, phonetic: string];

// 词表只加载一次，模块级缓存
let dict: Record<string, WordInfoTuple> | null = null;
let pending: Promise<void> | null = null;

/**
 * 词表来自 /dict/wordinfo.json（由 tools/build-wordinfo.mjs 从 ECDICT 生成）。
 * 含词性、简短中文释义、音标，用于答案页的逐词拆解。
 */
export function useWordInfo() {
  const isReady = ref(dict !== null);

  async function load() {
    if (dict) {
      isReady.value = true;
      return;
    }
    if (!pending) {
      pending = fetch("/dict/wordinfo.json")
        .then((res) => (res.ok ? res.json() : {}))
        .then((data) => {
          dict = data as Record<string, WordInfoTuple>;
        })
        .catch(() => {
          // 词表拿不到就降级为「只有单词和音标」，不影响答题
          dict = {};
        });
    }
    await pending;
    isReady.value = true;
  }

  function lookup(raw: string): WordInfo | null {
    if (!dict) return null;
    const key = raw.toLowerCase().replace(/[^a-z']/g, "");
    const item = dict[key];
    if (!item) return null;
    return { pos: item[0], translation: item[1], phonetic: item[2] };
  }

  return { isReady, load, lookup };
}

/**
 * 拆分整句音标为逐词音标。
 * 项目数据里的 soundmark 是按词分隔的，如 "/haʊ/ /dɪd/ /ju/"，
 * 但偶尔出现一个块覆盖多个词（"/ɡʊd ˈmɔrnɪŋ/"），对不齐时退回词典音标。
 */
function splitSoundmark(soundmark: string | undefined, count: number): string[] {
  if (!soundmark) return [];
  const blocks = soundmark.match(/\/[^/]*\//g) || [];
  if (blocks.length === count) return blocks;

  // 整句挤在一个斜杠块里（如 "/wʌt ɪz jʊr neɪm/"），把块内内容按空格切开再对齐
  const inner = blocks
    .map((block) => block.slice(1, -1).trim())
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  if (inner.length === count) return inner.map((item) => `/${item}/`);

  const parts = soundmark.trim().split(/\s+/);
  if (parts.length === count) return parts;
  return [];
}

/** 生成逐词卡片数据：单词 / 音标 / 词性 / 释义 */
export function buildWordCards(
  english: string,
  soundmark: string | undefined,
  lookup: (word: string) => WordInfo | null,
): WordCard[] {
  const words = english.split(/\s+/).filter(Boolean);
  const phonetics = splitSoundmark(soundmark, words.length);

  return words.map((word, index) => {
    const info = lookup(word);
    const fromSentence = phonetics[index] || "";
    const fromDict = info?.phonetic ? `/${info.phonetic}/` : "";
    return {
      text: word,
      clean: word.toLowerCase().replace(/[^a-z']/g, ""),
      phonetic: fromSentence || fromDict,
      pos: info?.pos || "",
      translation: info?.translation || "",
    };
  });
}
