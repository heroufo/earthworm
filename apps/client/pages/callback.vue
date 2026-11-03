<!-- 本地部署模式：原版这里是 Logto 登录回调页，本地无需认证，直接回到首页 -->
<script setup lang="ts">
import { navigateTo } from "nuxt/app";
import { onMounted } from "vue";

onMounted(() => {
  navigateTo("/");
});
</script>

<template>
  <div class="flex w-full flex-col items-center justify-center pt-10">
    <span class="loading loading-spinner loading-lg"></span>
    <p class="mt-4 text-sm opacity-60">正在进入…</p>
  </div>
</template>
