<template>
  <USlideover
    v-model="isUserMenuOpen"
    :ui="{ width: 'w-screen max-w-80' }"
  >
    <div class="flex h-full flex-col">
      <!-- 用户信息头部 -->
      <div class="flex items-center justify-between p-4">
        <div class="flex items-center gap-3">
          <div class="avatar">
            <div class="mask mask-squircle h-14 w-14">
              <UAvatar
                size="xl"
                :src="userStore.user?.avatar"
                alt="Avatar"
              />
            </div>
          </div>
          <div>
            <div class="flex gap-2">
              <div class="text-xl font-bold">{{ userStore.user?.username }}</div>
              <MembershipBadge></MembershipBadge>
            </div>
            <div class="text-sm opacity-75">{{ userStore.user?.name }}</div>
          </div>
        </div>

        <UButton
          color="gray"
          variant="ghost"
          icon="i-heroicons-x-mark-20-solid"
          @click="closeUserMenu"
          tabindex="-1"
          :ui="{ color: { gray: { ghost: 'dark:hover:bg-gray-600' } } }"
        />
      </div>

      <!-- 菜单选项 -->
      <div class="flex-grow p-4">
        <button
          v-for="(item, index) in showMenuOptions"
          :key="item.name"
          @click="item.eventName"
          class="mb-2 flex w-full items-center rounded-lg p-1 transition-all duration-200 ease-in-out hover:bg-base-200 hover:shadow-md dark:hover:bg-gray-600"
          tabindex="-1"
        >
          <UIcon
            :name="item.icon"
            class="mr-3 h-7 w-7"
          ></UIcon>
          <span class="font-medium">{{ item.title }}</span>
        </button>
      </div>

      <!-- 底部信息 -->
      <div class="p-4 text-center text-xs opacity-50">版本 v1.0.0</div>
    </div>
  </USlideover>
</template>

<script setup lang="ts">
import { navigateTo } from "#imports";
import { computed } from "vue";

import { Theme, useDarkMode } from "~/composables/darkMode";
import { useUserMenu } from "~/composables/user/useUserMenu";
import { useUserStore } from "~/store/user";

const { isUserMenuOpen, closeUserMenu } = useUserMenu();
const { darkMode, toggleDarkMode } = useDarkMode();

const userStore = useUserStore();
const isDarkMode = computed(() => darkMode.value === Theme.DARK);

const showMenuOptions = computed(() => {
  return [
    {
      title: "设置",
      name: "setting",
      eventName: handleSetting,
      icon: "i-ph-gear",
    },
    {
      title: "收藏",
      name: "favorites",
      eventName: handleFavorites,
      icon: "i-ph-star",
    },
    {
      title: "帮助文档",
      name: "helpDocs",
      eventName: handleHelpDocs,
      icon: "i-ph-book-open-text-duotone",
    },
    {
      title: "主题切换",
      name: "changeTheme",
      eventName: toggleDarkMode,
      icon: isDarkMode.value ? "i-ph-moon" : "i-ph-sun",
    },
  ];
});

function handleHelpDocs() {
  closeUserMenu();
  navigateTo("/help");
}

function handleFavorites() {
  closeUserMenu();
  navigateTo("/favorites");
}

function handleSetting() {
  closeUserMenu();
  navigateTo("/user/setting");
}
</script>

<style scoped></style>
