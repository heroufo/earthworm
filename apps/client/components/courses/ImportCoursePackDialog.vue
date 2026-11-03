<template>
  <div>
    <button
      class="import-trigger"
      @click="openDialog"
    >
      <span class="trigger-icon">＋</span>
      {{ label }}
    </button>

    <Teleport to="body">
      <div
        v-if="visible"
        class="dialog-mask"
        @click.self="closeDialog"
      >
        <div class="dialog">
          <header class="dialog-header">
            <h3 class="dialog-title">导入课程（CSV）</h3>
            <p class="dialog-sub">
              用 Excel 填好模板后另存为「CSV UTF-8」，选中文件后可以只导其中几节课
            </p>
          </header>

          <div class="dialog-body">
            <!-- 导入完成 -->
            <template v-if="result">
              <div class="result-head">
                <span class="result-badge">导入完成</span>
                <span class="result-summary">
                  {{ result.total.packs }} 个课程包 · {{ result.total.statements }} 句新增
                  <template v-if="result.total.skipped > 0">
                    · {{ result.total.skipped }} 句已存在跳过
                  </template>
                </span>
              </div>

              <div
                v-for="pack in result.packs"
                :key="pack.id"
                class="result-pack"
              >
                <div class="result-pack-title">
                  <span :class="pack.created ? 'tag-new' : 'tag-reuse'">
                    {{ pack.created ? "新建" : "并入" }}
                  </span>
                  {{ pack.title }}
                </div>
                <ul class="result-course-list">
                  <li
                    v-for="course in pack.courses"
                    :key="course.title"
                  >
                    <span class="course-name">{{ course.title }}</span>
                    <span class="course-stat">
                      <template v-if="course.added > 0">+{{ course.added }} 句</template>
                      <template v-else>已存在，未新增</template>
                      <template v-if="course.skipped > 0"
                        >（跳过 {{ course.skipped }} 句）</template
                      >
                    </span>
                  </li>
                </ul>
              </div>
            </template>

            <!-- 选文件 + 配置 -->
            <template v-else>
              <div
                class="drop-zone"
                :class="{ 'drop-zone--active': dragging, 'drop-zone--compact': !!preview }"
                @click="pickFile"
                @dragover.prevent="dragging = true"
                @dragleave.prevent="dragging = false"
                @drop.prevent="onDrop"
              >
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".csv,text/csv"
                  class="hidden-input"
                  @change="onPick"
                />
                <template v-if="!file">
                  <div class="drop-icon">📄</div>
                  <p class="drop-main">点击选择 CSV 文件</p>
                  <p class="drop-hint">或把文件拖到这里</p>
                </template>
                <template v-else>
                  <div class="drop-icon">✅</div>
                  <p class="drop-main">{{ fileName }}</p>
                  <p class="drop-hint">{{ fileSizeText }} · 点击可重新选择</p>
                </template>
              </div>

              <!-- 从课程包页进来时先说明会追加到哪里 -->
              <p
                v-if="defaultTargetPackId && !preview"
                class="target-hint"
              >
                导入的课程会追加到《{{ targetPackTitle || "当前课程包" }}》，不会动已有的课程
              </p>

              <!-- 目标课程包 -->
              <div
                v-if="preview"
                class="section"
              >
                <div class="section-title">导到哪里</div>
                <label class="radio-row">
                  <input
                    v-model="targetMode"
                    type="radio"
                    value="auto"
                  />
                  <span>
                    按 CSV 里的课程包名称
                    <em class="option-note">（包不存在会自动新建）</em>
                  </span>
                </label>
                <label class="radio-row">
                  <input
                    v-model="targetMode"
                    type="radio"
                    value="merge"
                    :disabled="coursePackStore.coursePacks.length === 0"
                  />
                  <span>
                    并入已有课程包
                    <em class="option-note">（分批导入时选这个）</em>
                  </span>
                </label>
                <select
                  v-if="targetMode === 'merge'"
                  v-model="targetPackId"
                  class="pack-select"
                >
                  <option
                    value=""
                    disabled
                  >
                    选择课程包…
                  </option>
                  <option
                    v-for="pack in coursePackStore.coursePacks"
                    :key="pack.id"
                    :value="pack.id"
                  >
                    {{ pack.title }}
                  </option>
                </select>

                <label
                  v-if="targetMode === 'auto'"
                  class="option-row"
                >
                  <input
                    v-model="replace"
                    type="checkbox"
                    class="option-checkbox"
                  />
                  <span>
                    覆盖同名课程包
                    <em class="option-note">（会先删掉该包下已有的课和句子再重建）</em>
                  </span>
                </label>
              </div>

              <!-- 课程勾选 -->
              <div
                v-if="preview"
                class="section"
              >
                <div class="section-head">
                  <div class="section-title">
                    选择要导入的课程
                    <span class="count-hint">
                      已选 {{ selectedTitles.length }} / {{ allCourseTitles.length }} 节 ·
                      {{ selectedStatementCount }} 句
                    </span>
                  </div>
                  <div class="quick-actions">
                    <button
                      class="link-btn"
                      @click="selectAll"
                    >
                      全选
                    </button>
                    <button
                      class="link-btn"
                      @click="clearAll"
                    >
                      全不选
                    </button>
                  </div>
                </div>

                <div class="course-picker">
                  <div
                    v-for="pack in preview.packs"
                    :key="pack.title"
                    class="pick-pack"
                  >
                    <div class="pick-pack-title">{{ pack.title }}</div>
                    <label
                      v-for="course in pack.courses"
                      :key="`${pack.title}-${course.title}`"
                      class="pick-course"
                    >
                      <input
                        type="checkbox"
                        :checked="selectedTitles.includes(course.title)"
                        @change="toggleCourse(course.title)"
                      />
                      <span class="pick-course-name">{{ course.title }}</span>
                      <span class="pick-course-count">{{ course.count }} 句</span>
                    </label>
                  </div>
                </div>
                <p
                  v-if="hasDuplicateTitles"
                  class="duplicate-note"
                >
                  有同名的课程（比如两个包里都叫「第一课」），勾选后会按课程名一起导入。
                </p>
              </div>

              <p
                v-if="error"
                class="error-box"
              >
                {{ error }}
              </p>

              <details class="tips">
                <summary>CSV 表头怎么写</summary>
                <div class="tips-body">
                  <p>必须有「中文」「英文」两列，其余可选，列顺序随意：</p>
                  <table class="tips-table">
                    <tbody>
                      <tr>
                        <td>课程包名称</td>
                        <td>选「并入已有课程包」时可以留空</td>
                      </tr>
                      <tr>
                        <td>课程包简介</td>
                        <td>显示在卡片副标题</td>
                      </tr>
                      <tr>
                        <td>课程名称</td>
                        <td>留空沿用上一行，整列空则自动叫「第一课」</td>
                      </tr>
                      <tr>
                        <td>中文</td>
                        <td>必填，界面上的中文提示</td>
                      </tr>
                      <tr>
                        <td>英文</td>
                        <td>必填，要拼的句子</td>
                      </tr>
                      <tr>
                        <td>音标</td>
                        <td>可空。含音标时必须存成 CSV UTF-8，否则 æ ə ʃ 会变问号</td>
                      </tr>
                    </tbody>
                  </table>
                  <p class="tips-note">
                    同一课里「中文+英文」完全相同的句子会自动跳过，重复导入不会翻倍。
                  </p>
                </div>
              </details>
            </template>
          </div>

          <footer class="dialog-footer">
            <button
              class="btn-ghost"
              @click="closeDialog"
            >
              {{ result ? "关闭" : "取消" }}
            </button>
            <button
              v-if="!result"
              class="btn-primary"
              :disabled="!canImport"
              @click="doImport"
            >
              {{ loading ? "导入中…" : "开始导入" }}
            </button>
            <button
              v-else
              class="btn-primary"
              @click="finish"
            >
              完成
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import type { CoursePackPreviewResult, ImportCoursePackResult } from "~/api/course-pack";
import { importCoursePackCsv, previewCoursePackCsv } from "~/api/course-pack";
import { useCoursePackStore } from "~/store/coursePack";

const props = withDefaults(
  defineProps<{
    /** 触发按钮文案 */
    label?: string;
    /** 预设目标课程包（课程列表页的「追加课程」用） */
    defaultTargetPackId?: string;
  }>(),
  { label: "导入课程", defaultTargetPackId: "" },
);

const emit = defineEmits<{
  (e: "imported", result: ImportCoursePackResult): void;
}>();

const coursePackStore = useCoursePackStore();

const visible = ref(false);
const dragging = ref(false);
const loading = ref(false);
const replace = ref(false);
const error = ref("");
const result = ref<ImportCoursePackResult | null>(null);

const fileInputRef = ref<HTMLInputElement | null>(null);
const file = ref<File | null>(null);
const csvText = ref("");

const preview = ref<CoursePackPreviewResult | null>(null);
const targetMode = ref<"auto" | "merge">("auto");
const targetPackId = ref("");
const selectedTitles = ref<string[]>([]);

const fileName = computed(() => file.value?.name ?? "");
const targetPackTitle = computed(
  () =>
    coursePackStore.coursePacks.find((pack) => pack.id === props.defaultTargetPackId)?.title ?? "",
);
const fileSizeText = computed(() => {
  const size = file.value?.size ?? 0;
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
});

const allCourseTitles = computed(() => {
  if (!preview.value) return [] as string[];
  return Array.from(
    new Set(preview.value.packs.flatMap((pack) => pack.courses.map((c) => c.title))),
  );
});

const hasDuplicateTitles = computed(() => {
  if (!preview.value) return false;
  const flat = preview.value.packs.flatMap((pack) => pack.courses.map((c) => c.title));
  return flat.length !== new Set(flat).size;
});

/** 已选课程一共多少句 */
const selectedStatementCount = computed(() => {
  if (!preview.value) return 0;
  let total = 0;
  for (const pack of preview.value.packs) {
    for (const course of pack.courses) {
      if (selectedTitles.value.includes(course.title)) total += course.count;
    }
  }
  return total;
});

const canImport = computed(() => {
  if (!file.value || !csvText.value || loading.value) return false;
  if (!preview.value) return true; // 还没预览成功时也允许直接试
  if (selectedTitles.value.length === 0) return false;
  if (targetMode.value === "merge" && !targetPackId.value) return false;
  return true;
});

function openDialog() {
  visible.value = true;
  reset();
  if (props.defaultTargetPackId) {
    targetMode.value = "merge";
    targetPackId.value = props.defaultTargetPackId;
  }
  // 从课程包详情页进来时列表还没拉过，这里补一次，否则下拉框是空的
  if (coursePackStore.coursePacks.length === 0) {
    coursePackStore.setupCoursePacks().catch(() => {
      /* 拉取失败就只影响下拉框，不挡导入 */
    });
  }
}

function closeDialog() {
  visible.value = false;
  if (result.value) emit("imported", result.value);
  reset();
}

function finish() {
  closeDialog();
}

function reset() {
  error.value = "";
  result.value = null;
  loading.value = false;
  dragging.value = false;
  file.value = null;
  csvText.value = "";
  preview.value = null;
  selectedTitles.value = [];
  replace.value = false;
  if (!props.defaultTargetPackId) {
    targetMode.value = "auto";
    targetPackId.value = "";
  }
  if (fileInputRef.value) fileInputRef.value.value = "";
}

function pickFile() {
  if (loading.value) return;
  fileInputRef.value?.click();
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0];
  if (picked) handleFile(picked);
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  const dropped = event.dataTransfer?.files?.[0];
  if (dropped) handleFile(dropped);
}

async function handleFile(picked: File) {
  error.value = "";
  result.value = null;
  preview.value = null;
  if (!/\.csv$/i.test(picked.name)) {
    error.value = "请选择 .csv 文件（Excel 里另存为「CSV UTF-8」）";
    return;
  }
  if (picked.size > 5 * 1024 * 1024) {
    error.value = "文件超过 5MB，建议拆分成多个课程包导入";
    return;
  }
  file.value = picked;
  try {
    csvText.value = await readCsvFile(picked);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "文件读取失败";
    file.value = null;
    return;
  }

  // 先解析出「包 → 课 → 句数」，让用户挑课
  loading.value = true;
  try {
    const data = await previewCoursePackCsv(csvText.value);
    preview.value = data;
    selectedTitles.value = Array.from(
      new Set(data.packs.flatMap((pack) => pack.courses.map((c) => c.title))),
    );
  } catch (e: any) {
    // 预览失败不挡住导入（老数据也能直接导），但把原因说出来
    const msg = Array.isArray(e?.message) ? e.message[0] : e?.message;
    error.value = msg || "无法解析这个 CSV，请检查表头";
  } finally {
    loading.value = false;
  }
}

/** Excel 在中文 Windows 下另存 CSV 默认是 GBK，先严格按 UTF-8 试，失败再退回 GBK */
function readCsvFile(target: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      try {
        resolve(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
      } catch {
        try {
          resolve(new TextDecoder("gbk").decode(buffer));
        } catch {
          reject(new Error("无法识别文件编码，请另存为 CSV UTF-8"));
        }
      }
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsArrayBuffer(target);
  });
}

function toggleCourse(title: string) {
  const index = selectedTitles.value.indexOf(title);
  if (index >= 0) selectedTitles.value.splice(index, 1);
  else selectedTitles.value.push(title);
}

function selectAll() {
  selectedTitles.value = [...allCourseTitles.value];
}

function clearAll() {
  selectedTitles.value = [];
}

async function doImport() {
  if (!file.value || !csvText.value) return;
  loading.value = true;
  error.value = "";
  try {
    const allSelected =
      allCourseTitles.value.length > 0 &&
      selectedTitles.value.length === allCourseTitles.value.length;
    const res = await importCoursePackCsv(csvText.value, {
      replace: replace.value,
      targetCoursePackId: targetMode.value === "merge" ? targetPackId.value : undefined,
      courseTitles: allSelected ? undefined : [...selectedTitles.value],
    });
    result.value = res;
  } catch (e: any) {
    // ofetch 抛出的通常是后端返回的 { message, statusCode }
    const msg = Array.isArray(e?.message) ? e.message[0] : e?.message;
    error.value = msg || e?.statusMessage || "导入失败，请检查 CSV 内容";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.import-trigger {
  @apply inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 transition-colors;
  @apply hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-900/40 dark:text-purple-300 dark:hover:bg-purple-900/70;
}

.trigger-icon {
  @apply text-base leading-none;
}

.dialog-mask {
  @apply fixed inset-0 flex items-center justify-center bg-black/50 p-4;
  /* 站点顶栏层级较高，这里写死一个足够大的值，保证遮罩压在导航之上 */
  z-index: 9999;
}

.dialog {
  @apply flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl;
  @apply dark:border-gray-700 dark:bg-gray-900;
}

.dialog-header {
  @apply border-b border-gray-100 px-6 py-4 dark:border-gray-800;
}

.dialog-title {
  @apply text-lg font-semibold text-gray-900 dark:text-gray-100;
}

.dialog-sub {
  @apply mt-1 text-xs text-gray-500 dark:text-gray-400;
}

.dialog-body {
  @apply flex-1 overflow-y-auto px-6 py-4;
}

.drop-zone {
  @apply flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 text-center transition-colors;
  @apply hover:border-purple-400 hover:bg-purple-50/50 dark:border-gray-600 dark:hover:border-purple-500 dark:hover:bg-purple-900/20;
}

.drop-zone--compact {
  @apply py-4;
}

.drop-zone--active {
  @apply border-purple-500 bg-purple-50 dark:border-purple-400 dark:bg-purple-900/30;
}

.hidden-input {
  display: none;
}

.drop-icon {
  @apply mb-2 text-3xl;
}

.drop-zone--compact .drop-icon {
  @apply mb-1 text-xl;
}

.drop-main {
  @apply text-sm font-medium text-gray-800 dark:text-gray-200;
}

.drop-hint {
  @apply mt-1 text-xs text-gray-500 dark:text-gray-400;
}

.section {
  @apply mt-5 border-t border-gray-100 pt-4 dark:border-gray-800;
}

/* 「会追加到《某包》」提示 */
.target-hint {
  @apply mt-3 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-300;
}

.section-head {
  @apply flex items-start justify-between gap-3;
}

.section-title {
  @apply text-sm font-medium text-gray-800 dark:text-gray-200;
}

.count-hint {
  @apply ml-2 text-xs font-normal text-gray-400 dark:text-gray-500;
}

.quick-actions {
  @apply flex shrink-0 gap-2;
}

.link-btn {
  @apply text-xs text-purple-600 transition-colors hover:text-purple-700 hover:underline dark:text-purple-400;
}

.radio-row {
  @apply mt-2 flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300;
}

.pack-select {
  @apply mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none;
  @apply focus:border-purple-500 focus:ring-2 focus:ring-purple-100;
  @apply dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100;
}

.option-row {
  @apply mt-2 flex cursor-pointer items-start gap-2 text-sm text-gray-700 dark:text-gray-300;
}

.option-checkbox {
  @apply mt-0.5;
}

.option-note {
  @apply text-xs not-italic text-gray-400 dark:text-gray-500;
}

.course-picker {
  @apply mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700;
}

.pick-pack + .pick-pack {
  @apply mt-2 border-t border-gray-100 pt-2 dark:border-gray-800;
}

.pick-pack-title {
  @apply text-xs font-medium text-gray-400 dark:text-gray-500;
}

.pick-course {
  @apply flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800;
}

.pick-course-name {
  @apply flex-1 truncate;
}

.pick-course-count {
  @apply shrink-0 text-xs text-gray-400 dark:text-gray-500;
}

.duplicate-note {
  @apply mt-2 text-xs text-amber-600 dark:text-amber-400;
}

.error-box {
  @apply mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300;
}

.tips {
  @apply mt-5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-400;
}

.tips summary {
  @apply cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300;
}

.tips-body {
  @apply mt-2 space-y-2;
}

.tips-table {
  @apply w-full;
}

.tips-table td {
  @apply border-t border-gray-200 py-1 align-top dark:border-gray-700;
}

.tips-table td:first-child {
  @apply w-24 whitespace-nowrap pr-2 font-medium text-gray-700 dark:text-gray-300;
}

.tips-note {
  @apply text-gray-500 dark:text-gray-500;
}

.result-head {
  @apply mb-3 flex items-center gap-2;
}

.result-badge {
  @apply rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300;
}

.result-summary {
  @apply text-sm text-gray-600 dark:text-gray-400;
}

.result-pack {
  @apply mb-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700;
}

.result-pack-title {
  @apply flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100;
}

.tag-new {
  @apply rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-normal text-purple-700 dark:bg-purple-900/40 dark:text-purple-300;
}

.tag-reuse {
  @apply rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-normal text-gray-600 dark:bg-gray-700 dark:text-gray-300;
}

.result-course-list {
  @apply mt-2 space-y-1 pl-1;
}

.result-course-list li {
  @apply flex items-baseline justify-between gap-3 text-xs;
}

.course-name {
  @apply text-gray-600 dark:text-gray-400;
}

.course-stat {
  @apply shrink-0 text-gray-500 dark:text-gray-500;
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
