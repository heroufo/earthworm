<template>
  <div class="fav-page">
    <!-- 头部 -->
    <div class="fav-head">
      <h1 class="fav-title">收藏</h1>
      <p class="fav-sub">
        共 <b>{{ total }}</b> 句{{ selectedCount ? ` · 已选 ${selectedCount} 句` : "" }}
      </p>
    </div>

    <!-- 工具条 -->
    <div class="fav-toolbar">
      <button
        class="select-all"
        :class="{ 'is-on': allSelected }"
        @click="toggleSelectAll"
      >
        <span
          class="cb-box"
          :class="{ 'is-checked': allSelected, 'is-partial': someSelected }"
        >
          <UIcon
            v-if="allSelected || someSelected"
            :name="allSelected ? 'i-ph-check-bold' : 'i-ph-minus-bold'"
            class="cb-icon"
          />
        </span>
        全选
      </button>

      <span
        v-if="selectedCount"
        class="sel-hint"
        >已选 {{ selectedCount }} 句</span
      >

      <div class="flex-1" />

      <button
        class="btn btn-ghost"
        :disabled="!selectedCount"
        @click="handleBatchRemove"
      >
        批量删除
      </button>
      <button
        class="btn btn-primary"
        :disabled="!selectedCount"
        @click="startPractice"
      >
        <UIcon
          name="i-ph-play-circle"
          class="btn-icon"
        />
        练习所选
      </button>
    </div>

    <!-- 空状态 -->
    <div
      v-if="!isLoading && items.length === 0"
      class="empty"
    >
      <UIcon
        name="i-ph-star"
        class="empty-icon"
      />
      <p class="empty-title">还没有收藏的句子</p>
      <p class="empty-sub">答题时点「收藏」，把不熟的句子攒起来，之后可以多选练习</p>
    </div>

    <!-- 列表 -->
    <div
      v-else
      class="fav-list"
    >
      <div
        v-for="(item, index) in items"
        :key="item.id"
        class="fav-row"
        :class="{ 'is-selected': isSelected(item.id) }"
        @click="toggle(item.id)"
      >
        <span
          class="cb"
          :class="{ 'is-checked': isSelected(item.id) }"
        >
          <UIcon
            v-if="isSelected(item.id)"
            name="i-ph-check-bold"
            class="cb-icon"
          />
        </span>

        <span class="row-idx">{{ index + 1 }}</span>

        <div class="row-main">
          <div class="row-en">
            {{ item.content.english }}
            <span
              v-if="metaMap[item.id]?.soundmark"
              class="row-phonetic"
              >{{ metaMap[item.id].soundmark }}</span
            >
          </div>
          <div class="row-sub">
            <span
              v-if="metaMap[item.id]?.chinese"
              class="row-cn"
              >{{ metaMap[item.id].chinese }}</span
            >
            <span class="row-meta">收藏于 {{ formatDate(item.masteredAt) }}</span>
          </div>
        </div>

        <button
          class="icon-btn"
          title="播放发音"
          @click.stop="speak(item.content.english)"
        >
          <UIcon
            name="i-ph-speaker-simple-high"
            class="icon-btn-glyph"
          />
        </button>
        <button
          class="icon-btn icon-btn-danger"
          title="删除这条收藏"
          @click.stop="handleRemoveOne(item)"
        >
          <UIcon
            name="i-ph-trash-bold"
            class="icon-btn-glyph"
          />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { navigateTo, useModal } from "#imports";
import { computed, onMounted, onUnmounted, ref } from "vue";

import type { MasteredElement } from "~/types/models/mastered-elements";
import { fetchPracticeItems } from "~/api/mastered-elements";
import Dialog from "~/components/common/Dialog.vue";
import { speakWithBrowser } from "~/composables/main/englishSound/audio";
import { usePronunciation } from "~/composables/user/pronunciation";
import { useMasteredElementsStore } from "~/store/masteredElements";

const store = useMasteredElementsStore();
const modal = useModal();
const { getPronunciationUrl, getFallbackPronunciationUrl } = usePronunciation();

const isLoading = ref(true);
const selectedIds = ref<string[]>([]);

const items = computed(() => store.masteredElements);
const total = computed(() => items.value.length);
const selectedCount = computed(() => selectedIds.value.length);
const allSelected = computed(() => total.value > 0 && selectedCount.value === total.value);
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value);

let audio: HTMLAudioElement | null = null;

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

function isSelected(id: string) {
  return selectedIds.value.includes(id);
}

function toggle(id: string) {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id];
}

function toggleSelectAll() {
  selectedIds.value = allSelected.value ? [] : items.value.map(({ id }) => id);
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function handleRemoveOne(item: MasteredElement) {
  selectedIds.value = selectedIds.value.filter((id) => id !== item.id);
  await store.removeElement(item.id);
}

function handleBatchRemove() {
  const ids = [...selectedIds.value];
  if (!ids.length) return;

  modal.open(Dialog, {
    title: "删除所选收藏",
    content: `将删除 ${ids.length} 条收藏，删除后不可恢复，是否继续？`,
    showCancel: true,
    showConfirm: true,
    confirmText: "删除",
    async onConfirm() {
      selectedIds.value = [];
      await store.removeElements(ids);
    },
  });
}

function startPractice() {
  if (!selectedCount.value) return;
  navigateTo({
    path: "/favorites/practice",
    query: { ids: selectedIds.value.join(",") },
  });
}

// 列表里顺带展示中文和音标：收藏表只存英文，按 id 去课程句子里反查
const metaMap = ref<Record<string, { chinese: string; soundmark: string }>>({});

// 收藏列表可能在别的页面被改动，这里只负责首次拉取
async function load() {
  isLoading.value = true;
  try {
    await store.setup();
  } catch {
    // 拉取失败时保持空列表，页面显示空状态
  } finally {
    isLoading.value = false;
  }

  const ids = items.value.map(({ id }) => id);
  if (!ids.length) return;

  try {
    const rows = await fetchPracticeItems(ids);
    const map: Record<string, { chinese: string; soundmark: string }> = {};
    rows.forEach((row) => {
      map[row.id] = { chinese: row.chinese, soundmark: row.soundmark };
    });
    metaMap.value = map;
  } catch {
    // 反查失败不影响列表主体，只是不显示中文/音标
  }
}

onMounted(load);
onUnmounted(() => {
  audio?.pause();
  audio = null;
});
</script>

<style scoped>
.fav-page {
  width: 100%;
  max-width: 900px;
  margin: 32px auto 64px;
  padding: 0 16px;
}

.fav-head {
  margin-bottom: 18px;
}

.fav-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #1c1c22;
}

.fav-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #8a8a99;
}

.fav-sub b {
  color: #6d4aff;
  font-weight: 700;
}

/* 工具条 */
.fav-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
  border: 1px solid #e6e6ee;
  border-radius: 14px;
  background-color: #ffffff;
}

.select-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  font-size: 14px;
  font-weight: 600;
  color: #4a4a58;
  border-radius: 8px;
  transition: color 0.16s ease;
}

.select-all:hover {
  color: #6d4aff;
}

.cb-box,
.cb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: 1.5px solid #cfcfdb;
  border-radius: 6px;
  background-color: #ffffff;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.cb-box.is-checked,
.cb-box.is-partial,
.cb.is-checked {
  border-color: #6d4aff;
  background-color: #6d4aff;
}

.cb-icon {
  width: 13px;
  height: 13px;
  color: #ffffff;
}

.sel-hint {
  font-size: 13px;
  color: #6d4aff;
  font-weight: 600;
}

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 600;
  border: 1px solid transparent;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.btn-primary {
  color: #ffffff;
  background-color: #6d4aff;
  box-shadow: 0 4px 12px rgba(109, 74, 255, 0.25);
}

.btn-primary:hover:not(:disabled) {
  background-color: #5b38f0;
}

.btn-ghost {
  color: #b42318;
  border-color: #f0c2bc;
  background-color: #fff5f4;
}

.btn-ghost:hover:not(:disabled) {
  background-color: #ffe9e6;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.42;
  box-shadow: none;
}

/* 列表 */
.fav-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fav-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid #e6e6ee;
  border-radius: 14px;
  background-color: #ffffff;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.fav-row:hover {
  border-color: #cfc6ff;
  box-shadow: 0 4px 14px rgba(109, 74, 255, 0.08);
}

.fav-row.is-selected {
  border-color: #6d4aff;
  background-color: #f7f4ff;
}

.row-idx {
  width: 22px;
  flex-shrink: 0;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: #a5a5b4;
  text-align: right;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-en {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 17px;
  line-height: 1.4;
  color: #1c1c22;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-phonetic {
  margin-left: 8px;
  font-size: 13px;
  color: #9aa9b8;
  letter-spacing: 0.2px;
}

.row-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  min-width: 0;
}

.row-cn {
  font-size: 12.5px;
  color: #5d6b7a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-meta {
  flex-shrink: 0;
  font-size: 12px;
  color: #9a9aa8;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9px;
  color: #6f6f7e;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.icon-btn:hover {
  background-color: #f1f0f7;
  color: #6d4aff;
}

.icon-btn-danger:hover {
  background-color: #fff0ef;
  color: #d92d20;
}

.icon-btn-glyph {
  width: 17px;
  height: 17px;
}

/* 空状态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64px 24px;
  border: 1px dashed #e0e0ea;
  border-radius: 16px;
  background-color: #fbfbfd;
  text-align: center;
}

.empty-icon {
  width: 34px;
  height: 34px;
  color: #c9c9d6;
  margin-bottom: 12px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #55555f;
}

.empty-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #9a9aa8;
}

/* 深色 */
.dark .fav-title {
  color: #f2f2f6;
}

.dark .fav-sub {
  color: #8e8e9f;
}

.dark .fav-toolbar,
.dark .fav-row {
  border-color: #2c2c36;
  background-color: #1a1a20;
}

.dark .select-all {
  color: #c9c9d6;
}

.dark .cb-box,
.dark .cb {
  border-color: #3a3a46;
  background-color: #22222a;
}

.dark .cb-box.is-checked,
.dark .cb-box.is-partial,
.dark .cb.is-checked {
  border-color: #8b6bff;
  background-color: #8b6bff;
}

.dark .fav-row:hover {
  border-color: #4a3f7a;
  box-shadow: none;
}

.dark .fav-row.is-selected {
  border-color: #8b6bff;
  background-color: #221f33;
}

.dark .row-en {
  color: #ececf2;
}

.dark .row-phonetic {
  color: #8f93a8;
}

.dark .row-cn {
  color: #a9adc0;
}

.dark .row-idx,
.dark .row-meta {
  color: #7c7c8d;
}

.dark .icon-btn {
  color: #9a9aab;
}

.dark .icon-btn:hover {
  background-color: #26262f;
  color: #b9a6ff;
}

.dark .btn-ghost {
  color: #ffb0a8;
  border-color: #6d3a35;
  background-color: #2a1b1a;
}

.dark .empty {
  border-color: #2c2c36;
  background-color: #17171c;
}

.dark .empty-title {
  color: #c9c9d6;
}

.dark .empty-sub {
  color: #7c7c8d;
}

@media (max-width: 640px) {
  .fav-page {
    margin-top: 20px;
    padding: 0 12px;
  }

  .fav-toolbar {
    gap: 8px;
    padding: 8px 10px;
  }

  .btn {
    padding: 0 10px;
    height: 32px;
  }

  .sel-hint {
    display: none;
  }

  .row-en {
    font-size: 15.5px;
  }
}
</style>
