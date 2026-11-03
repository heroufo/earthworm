import { useLocalStorageBoolean } from "~/utils/localStorage";

export const AUTO_PRONUNCIATION = "autoPronunciation";
export const KEYBOARD_SOUND_KEY = "keyboardSoundEnabled";
export const AUTO_PLAYENGLISH = "autoPlayEnglish";

export function useAutoPronunciation() {
  const {
    value: autoPlaySound,
    isTrue: isAutoPlaySound,
    toggle: toggleAutoPlaySound,
    remove: removeAutoPlaySound,
  } = useLocalStorageBoolean(AUTO_PRONUNCIATION, true); // 默认开启

  return {
    autoPlaySound,
    isAutoPlaySound,
    toggleAutoPlaySound,
    removeAutoPlaySound,
  };
}

export function useKeyboardSound() {
  const {
    value: keyboardSound,
    isTrue: isKeyboardSoundEnabled,
    toggle: toggleKeyboardSound,
    remove: removeKeyboardSound,
  } = useLocalStorageBoolean(KEYBOARD_SOUND_KEY, true); // 默认开启

  return {
    keyboardSound,
    isKeyboardSoundEnabled,
    toggleKeyboardSound,
    removeKeyboardSound,
  };
}

export function useAutoPlayEnglish() {
  const {
    value: autoPlayEnglish,
    isTrue: isAutoPlayEnglish,
    toggle: toggleAutoPlayEnglish,
    remove: removeAutoPlayEnglish,
  } = useLocalStorageBoolean(AUTO_PLAYENGLISH, true); // 默认开启

  return {
    autoPlayEnglish,
    isAutoPlayEnglish,
    toggleAutoPlayEnglish,
    removeAutoPlayEnglish,
  };
}

/**
 * 答对后朗读英文
 * ------------------------------------------------------------
 * 中译英练习时，答题前先读英文等于把答案念出来。
 * 关掉「答题时先读英文」、打开这一项，就是「先答，答对再听」的节奏。
 */
export const PLAY_AFTER_CORRECT = "playAfterCorrect";

export function usePlayAfterCorrect() {
  const {
    value: playAfterCorrect,
    isTrue: isPlayAfterCorrect,
    toggle: togglePlayAfterCorrect,
    remove: removePlayAfterCorrect,
  } = useLocalStorageBoolean(PLAY_AFTER_CORRECT, true); // 默认开启

  return {
    playAfterCorrect,
    isPlayAfterCorrect,
    togglePlayAfterCorrect,
    removePlayAfterCorrect,
  };
}
