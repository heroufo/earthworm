<template>
  <div class="py-16 text-center text-sm opacity-60">正在跳转到收藏…</div>
</template>

<script setup lang="ts">
import { navigateTo } from "#imports";
import { onMounted } from "vue";

// 旧地址兼容：掌握列表已改名收藏
onMounted(() => {
  navigateTo("/favorites", { replace: true });
});
</script>
