import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type { MasteredElement, MasteredElementContent } from "~/types/models/mastered-elements";
import {
  fetchAddMasteredElement,
  fetchGetMasteredElements,
  fetchRemoveMasteredElements,
} from "~/api/mastered-elements";

export const useMasteredElementsStore = defineStore("masteredElements", () => {
  const masteredElements = ref<MasteredElement[]>([]);

  const totalMasteredElementsCount = computed(() => {
    return masteredElements.value.length;
  });

  async function addElement(content: MasteredElementContent) {
    const result = await fetchAddMasteredElement(content);
    const previousElements = [...masteredElements.value];
    masteredElements.value.unshift(result);

    return () => {
      masteredElements.value = previousElements;
      fetchRemoveMasteredElements(result.id).catch(console.error);
    };
  }

  async function removeElement(elementId: string) {
    await fetchRemoveMasteredElements(elementId);

    masteredElements.value = masteredElements.value.filter(({ id }) => {
      return id !== elementId;
    });
  }

  // 批量删除：先本地摘掉（界面立刻响应），再逐条请求；失败的记录回滚回去
  async function removeElements(elementIds: string[]) {
    if (!elementIds.length) return { failed: [] as string[] };

    const idSet = new Set(elementIds);
    const removed = masteredElements.value.filter(({ id }) => idSet.has(id));
    masteredElements.value = masteredElements.value.filter(({ id }) => !idSet.has(id));

    const results = await Promise.allSettled(
      elementIds.map((id) => fetchRemoveMasteredElements(id)),
    );

    const failed: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") failed.push(elementIds[index]);
    });

    if (failed.length) {
      const failedSet = new Set(failed);
      masteredElements.value = [
        ...removed.filter(({ id }) => failedSet.has(id)),
        ...masteredElements.value,
      ];
    }

    return { failed };
  }

  function checkMastered(english: string) {
    return !!masteredElements.value.find((element) => {
      return element.content.english.toLowerCase() === english.toLowerCase();
    });
  }

  async function setup() {
    const elements = await fetchGetMasteredElements();
    masteredElements.value = [...elements];
  }

  return {
    masteredElements,
    totalMasteredElementsCount,
    addElement,
    removeElement,
    removeElements,
    checkMastered,
    setup,
  };
});
