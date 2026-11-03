<template>
  <div class="flex w-full flex-col">
    <template v-if="isLoading">
      <Loading></Loading>
    </template>

    <template v-else>
      <h2 class="text-center text-3xl dark:border-gray-600">
        {{ coursePackStore.currentCoursePack?.title }}
      </h2>
      <p
        v-if="courses.length"
        class="list-summary"
      >
        共 {{ courses.length }} 课 · {{ totalStatements }} 句
      </p>
      <div class="pack-actions">
        <CoursesImportCoursePackDialog
          label="追加课程"
          :default-target-pack-id="coursePackId"
          @imported="onImported"
        />
      </div>
      <div class="h-full scrollbar-hide">
        <div class="course-list scrollbar-hide">
          <CoursesCourseRow
            v-for="(course, index) in courses"
            :key="course.id"
            :index="index + 1"
            :title="course.title"
            :description="course.description"
            :id="course.id"
            :count="course.completionCount"
            :statementCount="course.statementCount"
            :learnedCount="course.learnedCount"
            :coursePackId="course.coursePackId"
            @click="handleChangeCourse(course.id)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";

import type { ImportCoursePackResult } from "~/api/course-pack";
import CoursesImportCoursePackDialog from "~/components/courses/ImportCoursePackDialog.vue";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { useCoursePackStore } from "~/store/coursePack";

const isLoading = ref(false);
const route = useRoute();
const coursePackStore = useCoursePackStore();
const coursePackId = route.params.id as string;
const { updateActiveCourseMap } = useActiveCourseMap();

const courses = computed(() => coursePackStore.currentCoursePack?.courses ?? []);
const totalStatements = computed(() =>
  courses.value.reduce((sum, course) => sum + (course.statementCount ?? 0), 0),
);

setup();

async function setup() {
  isLoading.value = true;
  // force：从课程页返回时也要重新拉，进度条才是刚学完的那个数
  await coursePackStore.setupCoursePack(coursePackId, true);
  isLoading.value = false;
}

function handleChangeCourse(courseId: string) {
  updateActiveCourseMap(coursePackId, courseId);
  navigateTo(`/game/${coursePackId}/${courseId}`);
}

/** 追加课程后重新拉本包，课程列表立刻出现新导入的课 */
async function onImported(result: ImportCoursePackResult) {
  await coursePackStore.setupCoursePack(coursePackId);
  if (result.total.statements > 0) {
    toast(`已追加 ${result.total.statements} 句`, {
      description: result.packs
        .flatMap((pack) => pack.courses)
        .map((course) => `${course.title} +${course.added}`)
        .join("，"),
    });
  }
}
</script>

<style scoped>
.list-summary {
  margin-top: 7px;
  margin-bottom: 18px;
  text-align: center;
  font-size: 13px;
  letter-spacing: 0.3px;
  color: #9a9aa8;
}

.pack-actions {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

.dark .list-summary {
  color: #8a8a9e;
}

.course-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 900px;
  max-height: 76vh;
  margin: 0 auto;
  padding: 2px 4px 40px;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
