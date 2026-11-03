<template>
  <div class="flex w-full flex-col">
    <div class="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:px-0">
      <span></span>
      <h2 class="text-center text-3xl dark:border-gray-600">课程包列表</h2>
      <div class="flex items-center gap-2 justify-self-end">
        <CreateCoursePackDialog @created="onCreated" />
        <ImportCoursePackDialog @imported="onImported" />
      </div>
    </div>
    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <div class="h-[79vh] overflow-y-auto overflow-x-hidden scrollbar-hide">
        <div
          class="grid auto-rows-fr grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:px-0 md:grid-cols-3 lg:grid-cols-4"
        >
          <template v-for="coursePack in coursePackStore.coursePacks">
            <CoursePackCard
              :coursePack="{
                id: coursePack.id,
                title: coursePack.title,
                description: coursePack.description,
                cover: coursePack.cover,
                isFree: coursePack.isFree,
              }"
              @cardClick="handleGoToCoursePack"
              @delete="handleDeleteCoursePack"
            ></CoursePackCard>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useModal } from "#imports";
import { ref } from "vue";
import { toast } from "vue-sonner";

import type { CoursePack } from "~/types";
import Dialog from "~/components/common/Dialog.vue";
import CoursePackCard from "~/components/courses/CoursePackCard.vue";
import CreateCoursePackDialog from "~/components/courses/CreateCoursePackDialog.vue";
import ImportCoursePackDialog from "~/components/courses/ImportCoursePackDialog.vue";
import { useNavigation } from "~/composables/useNavigation";
import { useCoursePackStore } from "~/store/coursePack";

const coursePackStore = useCoursePackStore();
const { gotoCourseList } = useNavigation();
const modal = useModal();
const isLoading = ref(false);

/** 网页端导入完成后刷新列表 */
async function onImported() {
  await coursePackStore.setupCoursePacks();
}

/** 新建空课程包后刷新列表；新建的包还没有课程，进去再追加 */
async function onCreated(pack: { title: string; id: string }) {
  await coursePackStore.setupCoursePacks();
  toast(`已创建课程包《${pack.title}》`, {
    description: "接下来可以分批次把课程导进这个包",
  });
}

setup();

async function setup() {
  // 课程包不会更新 所以初始化的时候只拉取一次数据就好了
  if (coursePackStore.coursePacks.length === 0) {
    isLoading.value = true;
    await coursePackStore.setupCoursePacks();
    isLoading.value = false;
  }
}

function handleGoToCoursePack(coursePack: CoursePack) {
  if (coursePack.isFree) {
    gotoCourseList(coursePack.id);
  } else {
    // 看看是不是会员 不是的话 直接弹出消息告知 需要是会员
    // TODO 还没有检测是不是会员的功能函数
    console.log("需要是会员");
  }
}

/** 删除课程包：二次确认后连同课程、句子、学习记录一起删掉 */
function handleDeleteCoursePack(coursePack: CoursePack) {
  modal.open(Dialog, {
    title: "删除课程包",
    content: `确定删除《${coursePack.title}》吗？该课程包下的课程、句子和学习记录会一并删除，且无法恢复。`,
    showCancel: true,
    showConfirm: true,
    confirmText: "删除",
    async onConfirm() {
      try {
        const result = await coursePackStore.deleteCoursePack(coursePack.id);
        toast(`已删除《${result.title}》`, {
          description: `同时移除 ${result.deletedCourses} 节课程及其句子`,
        });
      } catch (error: any) {
        toast.error(error?.message || "删除失败，请稍后重试");
      }
    },
  });
}
</script>

<style></style>
