import { defineNuxtPlugin } from "nuxt/app";

import { setupAuth } from "~/services/auth";

/**
 * 本地部署模式（Local Mode）
 * 原版在这里用 createLogto 注册 Logto 客户端；本地部署不需要，
 * 只初始化本地认证服务即可。
 */
export default defineNuxtPlugin(() => {
  setupAuth();
});
