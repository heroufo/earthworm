<template>
  <div
    :ref="isActiveCourse ? 'activeCourseRef' : undefined"
    class="course-row"
    :class="{ 'is-active': isActiveCourse, 'is-finished': hasFinished }"
    role="button"
    tabindex="0"
    @click="$emit('click')"
    @keydown.enter="$emit('click')"
    @keydown.space.prevent="$emit('click')"
  >
    <!-- 序号 -->
    <div class="row-index">{{ paddedIndex }}</div>

    <!-- 标题 + 描述 + 进度 -->
    <div class="row-main">
      <div class="row-title">{{ title }}</div>
      <div
        v-if="description"
        class="row-desc"
        :title="description"
      >
        {{ description }}
      </div>

      <!-- 学习进度条：已学句数 / 总句数 -->
      <div
        v-if="statementCount > 0"
        class="row-progress"
        :title="`已学 ${learnedCount} 句，共 ${statementCount} 句`"
      >
        <div class="progress-track">
          <div
            class="progress-fill"
            :class="{ 'is-done': isDone }"
            :style="{ width: `${percent}%` }"
          ></div>
        </div>
        <span class="progress-label">
          <b>{{ learnedCount }}</b> / {{ statementCount }} 句
        </span>
      </div>
    </div>

    <!-- 元信息 -->
    <div class="row-meta">
      <span
        class="meta-percent"
        :class="{ 'is-done': isDone, 'is-zero': percent === 0 }"
        :title="`已学 ${learnedCount} 句，共 ${statementCount} 句`"
      >
        {{ percent }}%
      </span>

      <span
        v-if="hasFinished"
        class="meta-pill is-ok"
        :title="`已完整学过 ${count} 次`"
      >
        <UIcon
          name="i-ph-check-circle"
          class="meta-icon"
        />
        <b>{{ count }}</b> 次
      </span>

      <span class="row-arrow">
        <UIcon
          name="i-ph-caret-right"
          class="arrow-icon"
        />
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { useActiveCourseMap } from "~/composables/courses/activeCourse";

const props = defineProps<{
  index: number;
  title: string;
  id: string;
  count: number | undefined;
  statementCount: number | undefined;
  /** 已学句子数（后端按课记录的学习位置） */
  learnedCount: number | undefined;
  coursePackId: string;
  description: string;
}>();

defineEmits<{ click: [] }>();

const { activeCourseMap } = useActiveCourseMap();
const activeCourseRef = ref<HTMLDivElement>();

const hasFinished = computed(() => !!props.count);
const isActiveCourse = computed(() => activeCourseMap.value[props.coursePackId] === props.id);
const paddedIndex = computed(() => String(props.index).padStart(2, "0"));
const statementCount = computed(() => props.statementCount ?? 0);
const learnedCount = computed(() =>
  Math.min(statementCount.value, Math.max(0, props.learnedCount ?? 0)),
);
const percent = computed(() => {
  if (statementCount.value <= 0) return 0;
  return Math.min(100, Math.round((learnedCount.value / statementCount.value) * 100));
});
const isDone = computed(() => statementCount.value > 0 && percent.value >= 100);

onMounted(() => {
  activeCourseRef.value?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
});
</script>

<style scoped>
.course-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 18px 22px;
  border-radius: 14px;
  border: 1px solid #e6e6ee;
  background-color: #ffffff;
  box-shadow: 0 1px 2px rgba(28, 28, 40, 0.04);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.12s ease;
}

.course-row:hover {
  border-color: #c8bff2;
  background-color: #fbfaff;
  box-shadow: 0 6px 18px rgba(90, 70, 180, 0.08);
  transform: translateY(-1px);
}

.course-row:focus-visible {
  outline: 2px solid #8b7bf0;
  outline-offset: 2px;
}

/* 上次在学的课程 */
.course-row.is-active {
  border-color: #a78bfa;
  background-color: #faf8ff;
  box-shadow: 0 0 0 1px rgba(167, 139, 250, 0.35);
}

.course-row.is-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 3px;
  border-radius: 3px;
  background-color: #8b5cf6;
}

.row-index {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background-color: #f4f4f8;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  color: #8a8a99;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.course-row.is-active .row-index {
  background-color: #8b5cf6;
  color: #fff;
}

.course-row.is-finished:not(.is-active) .row-index {
  background-color: #e8f7ef;
  color: #0f9d58;
}

.row-main {
  min-width: 0;
  flex: 1;
}

.row-title {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
  color: #1c1c22;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-row.is-active .row-title {
  color: #6d28d9;
}

.row-desc {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.45;
  color: #8a8a99;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 进度条 ---------- */
.row-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 9px;
}

.progress-track {
  position: relative;
  flex: 1;
  min-width: 60px;
  height: 6px;
  border-radius: 999px;
  background-color: #eeeef4;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #b39dff 0%, #7c5cf0 100%);
  transition: width 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.progress-fill.is-done {
  background: linear-gradient(90deg, #6ee7a8 0%, #0f9d58 100%);
}

.progress-label {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1;
  color: #9a9aa8;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.progress-label b {
  font-weight: 700;
  color: #5f5f6e;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 11px;
  border-radius: 999px;
  background-color: #f4f4f8;
  font-size: 13px;
  color: #5f5f6e;
  white-space: nowrap;
}

.meta-pill b {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #2c2c36;
}

.meta-pill.is-ok {
  background-color: #e8f7ef;
  color: #0b8a4b;
}
.meta-pill.is-ok b {
  color: #0b8a4b;
}

.meta-percent {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 54px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background-color: #f3f0ff;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
  color: #6d4aff;
  white-space: nowrap;
}

.meta-percent.is-zero {
  background-color: #f4f4f8;
  font-weight: 600;
  color: #9a9aa8;
}

.meta-percent.is-done {
  background-color: #e8f7ef;
  color: #0b8a4b;
}

.meta-icon {
  width: 14px;
  height: 14px;
  opacity: 0.8;
}

.row-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  color: #b0b0bd;
  transition:
    color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease;
}

.course-row:hover .row-arrow {
  color: #6d28d9;
  background-color: rgba(139, 92, 246, 0.1);
  transform: translateX(2px);
}

.arrow-icon {
  width: 16px;
  height: 16px;
}

/* ---------- 深色主题 ---------- */
.dark .course-row {
  border-color: #32323e;
  background-color: #1c1c24;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.dark .course-row:hover {
  border-color: #5b4b9e;
  background-color: #211f2b;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}

.dark .course-row.is-active {
  border-color: #7c5cf0;
  background-color: #221f30;
  box-shadow: 0 0 0 1px rgba(124, 92, 240, 0.4);
}

.dark .row-index {
  background-color: #26262f;
  color: #9d9dae;
}

.dark .course-row.is-active .row-index {
  background-color: #7c5cf0;
  color: #fff;
}

.dark .course-row.is-finished:not(.is-active) .row-index {
  background-color: #123326;
  color: #34d399;
}

.dark .row-title {
  color: #ececf1;
}

.dark .course-row.is-active .row-title {
  color: #c4b1ff;
}

.dark .row-desc {
  color: #8b8b9c;
}

.dark .progress-track {
  background-color: #2c2c38;
}

.dark .progress-label {
  color: #8b8b9c;
}

.dark .progress-label b {
  color: #d7d7e2;
}

.dark .meta-percent {
  background-color: #272236;
  color: #b9a6ff;
}

.dark .meta-percent.is-zero {
  background-color: #26262f;
  color: #8b8b9c;
}

.dark .meta-percent.is-done {
  background-color: #123326;
  color: #34d399;
}

.dark .meta-pill {
  background-color: #26262f;
  color: #a9a9ba;
}

.dark .meta-pill b {
  color: #e4e4ec;
}

.dark .meta-pill.is-ok {
  background-color: #123326;
  color: #34d399;
}

.dark .meta-pill.is-ok b {
  color: #34d399;
}

.dark .row-arrow {
  color: #55556a;
}

.dark .course-row:hover .row-arrow {
  color: #c4b1ff;
  background-color: rgba(124, 92, 240, 0.16);
}

@media (max-width: 640px) {
  .course-row {
    padding: 14px 14px;
    gap: 11px;
  }

  .row-index {
    width: 32px;
    height: 32px;
    font-size: 13px;
  }

  .row-title {
    font-size: 15px;
  }

  .row-desc {
    display: none;
  }

  .meta-pill {
    height: 25px;
    padding: 0 9px;
    font-size: 12px;
  }

  .meta-pill.is-ok {
    display: none;
  }

  .meta-percent {
    min-width: 44px;
    height: 25px;
    padding: 0 8px;
    font-size: 12px;
  }

  .row-progress {
    gap: 8px;
    margin-top: 6px;
  }

  .progress-label {
    font-size: 11px;
  }
}
</style>
