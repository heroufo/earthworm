<template>
  <div
    class="course-pack-card"
    @click="$emit('cardClick', coursePack)"
  >
    <figure class="cover-wrap relative aspect-video overflow-hidden">
      <img
        :src="coverSrc"
        :alt="coursePack.title"
        width="288"
        height="180"
        loading="lazy"
        decoding="async"
        class="absolute inset-0 h-full w-full object-cover"
        @error="onCoverError"
      />
      <button
        v-if="deletable"
        type="button"
        class="delete-btn"
        title="删除课程包"
        aria-label="删除课程包"
        @click.stop="$emit('delete', coursePack)"
      >
        <UIcon
          name="i-ph-trash"
          class="h-4 w-4"
        />
      </button>
    </figure>
    <div class="card-body">
      <h2 class="card-title truncate">{{ coursePack.title }}</h2>
      <p
        class="description-text"
        :title="coursePack.description"
      >
        {{ coursePack.description }}
      </p>
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

interface Props {
  coursePack: {
    id: string;
    title: string;
    description: string;
    cover: string;
    isFree: boolean;
  };
  /** 是否显示删除按钮（列表页显示，别的场景引用时可关掉） */
  deletable?: boolean;
}

const props = withDefaults(defineProps<Props>(), { deletable: true });

defineEmits<{
  (e: "cardClick", coursePack: any): void;
  (e: "delete", coursePack: any): void;
}>();

/** 本地兜底封面：原作者的 COS 图床已 404，新导入的包也常常没有封面 */
const DEFAULT_COVER = "/covers/default.svg";
const coverFailed = ref(false);

const coverSrc = computed(() => {
  if (coverFailed.value) return DEFAULT_COVER;
  const cover = (props.coursePack?.cover ?? "").trim();
  return cover === "" ? DEFAULT_COVER : cover;
});

function onCoverError() {
  // 外链失效时切到本地兜底，避免出现裂图
  if (!coverFailed.value) coverFailed.value = true;
}

watch(
  () => props.coursePack?.cover,
  () => {
    coverFailed.value = false;
  },
);
</script>

<style scoped>
.course-pack-card {
  @apply flex cursor-pointer flex-col overflow-hidden rounded-md rounded-t-xl border bg-white transition-all duration-300 dark:border-gray-700 dark:bg-gray-900;
  @apply hover:text-purple-500 hover:shadow-even-lg hover:shadow-gray-300 hover:dark:text-purple-400 dark:hover:shadow-gray-500;
  width: 100%;
  max-width: 100%; /* 在移动端允许卡片占满整个宽度 */
  height: 100%;
}

/* 图片改为绝对定位后，封面框高度必须自己撑住，不能指望 aspect-video 类（构建产物里没生成） */
.cover-wrap {
  @apply bg-gray-100 dark:bg-gray-800;
  aspect-ratio: 16 / 9;
  min-height: 0;
}

/* 封面右上角的删除按钮：鼠标移入卡片才浮现，触屏设备常显
   底色统一用半透明深色 + 白图标，这样在亮封面/暗封面/图片封面上都看得清 */
.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background-color: rgba(17, 24, 39, 0.55);
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease,
    background-color 0.16s ease;
}

.course-pack-card:hover .delete-btn {
  opacity: 1;
  transform: scale(1);
}

.delete-btn:hover {
  background-color: #ef4444;
}

.delete-btn:focus-visible {
  opacity: 1;
  transform: scale(1);
  outline: 2px solid #ef4444;
  outline-offset: 1px;
}

@media (hover: none) {
  .delete-btn {
    opacity: 1;
    transform: scale(1);
  }
}

.card-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.card-title {
  @apply text-lg font-semibold;
  flex-grow: 0;
}

.description-text {
  @apply my-2 line-clamp-2 text-sm text-gray-500;
  flex-grow: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  position: relative;
}

@media (hover: hover) {
  .description-text:hover::after {
    content: attr(title);
    position: absolute;
    left: 0;
    top: 100%;
    z-index: 10;
    background: white;
    padding: 5px;
    border: 1px solid #ddd;
    border-radius: 4px;
    white-space: normal;
    word-wrap: break-word;
    max-width: 300px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  }
}

/* 暗色模式适配 */
@media (prefers-color-scheme: dark) {
  .description-text:hover::after {
    background: #1a202c;
    border-color: #4a5568;
    color: white;
  }
}

/* 移动端适配 */
@media (max-width: 640px) {
  .course-pack-card {
    max-width: 100%; /* 确保在小屏幕上占满宽度 */
  }

  .card-body {
    padding: 0.75rem; /* 稍微减少内边距 */
  }

  .card-title {
    @apply text-base; /* 减小标题字体大小 */
  }

  .description-text {
    @apply text-xs; /* 减小描述文字大小 */
  }
}
</style>
