<template>
  <div>
    <button
      class="create-trigger"
      @click="openDialog"
    >
      <span class="trigger-icon">＋</span>
      新建课程包
    </button>

    <Teleport to="body">
      <div
        v-if="visible"
        class="dialog-mask"
        @click.self="closeDialog"
      >
        <div class="dialog">
          <header class="dialog-header">
            <h3 class="dialog-title">新建课程包</h3>
            <p class="dialog-sub">
              先建一个空包，之后可以分几批把课程导进来（CSV 里课程包名称留空也行）
            </p>
          </header>

          <div class="dialog-body">
            <label class="field">
              <span class="field-label">课程包名称</span>
              <input
                ref="titleInputRef"
                v-model="title"
                class="field-input"
                type="text"
                maxlength="40"
                placeholder="例如：新概念英语第一册"
                @keydown.enter.prevent="doCreate"
              />
            </label>

            <label class="field">
              <span class="field-label">
                简介
                <em class="field-note">可选，显示在卡片上</em>
              </span>
              <input
                v-model="description"
                class="field-input"
                type="text"
                maxlength="200"
                placeholder="例如：零基础起步，共 30 课"
                @keydown.enter.prevent="doCreate"
              />
            </label>

            <p
              v-if="error"
              class="error-box"
            >
              {{ error }}
            </p>
          </div>

          <footer class="dialog-footer">
            <button
              class="btn-ghost"
              @click="closeDialog"
            >
              取消
            </button>
            <button
              class="btn-primary"
              :disabled="!title.trim() || loading"
              @click="doCreate"
            >
              {{ loading ? "创建中…" : "创建" }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from "vue";

import type { CoursePacksItem } from "~/types";
import { createCoursePack } from "~/api/course-pack";

const emit = defineEmits<{
  (e: "created", pack: CoursePacksItem): void;
}>();

const visible = ref(false);
const loading = ref(false);
const error = ref("");
const title = ref("");
const description = ref("");
const titleInputRef = ref<HTMLInputElement | null>(null);

function openDialog() {
  visible.value = true;
  title.value = "";
  description.value = "";
  error.value = "";
  loading.value = false;
  nextTick(() => titleInputRef.value?.focus());
}

function closeDialog() {
  visible.value = false;
}

async function doCreate() {
  if (!title.value.trim() || loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const pack = await createCoursePack(title.value.trim(), description.value.trim());
    emit("created", pack as unknown as CoursePacksItem);
    visible.value = false;
  } catch (e: any) {
    const msg = Array.isArray(e?.message) ? e.message[0] : e?.message;
    error.value = msg || "创建失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.create-trigger {
  @apply inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors;
  @apply hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700;
}

.trigger-icon {
  @apply text-base leading-none;
}

.dialog-mask {
  @apply fixed inset-0 flex items-center justify-center bg-black/50 p-4;
  z-index: 9999;
}

.dialog {
  @apply flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl;
  @apply dark:border-gray-700 dark:bg-gray-900;
}

.dialog-header {
  @apply border-b border-gray-100 px-6 py-4 dark:border-gray-800;
}

.dialog-title {
  @apply text-lg font-semibold text-gray-900 dark:text-gray-100;
}

.dialog-sub {
  @apply mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400;
}

.dialog-body {
  @apply space-y-4 px-6 py-5;
}

.field {
  @apply block;
}

.field-label {
  @apply mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300;
}

.field-note {
  @apply ml-1 text-xs font-normal not-italic text-gray-400 dark:text-gray-500;
}

.field-input {
  @apply w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors;
  @apply focus:border-purple-500 focus:ring-2 focus:ring-purple-100;
  @apply dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-purple-500 dark:focus:ring-purple-900/40;
}

.error-box {
  @apply rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300;
}

.dialog-footer {
  @apply flex justify-end gap-2 border-t border-gray-100 px-6 py-3 dark:border-gray-800;
}

.btn-ghost {
  @apply rounded-lg px-4 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800;
}

.btn-primary {
  @apply rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50;
}
</style>
