/**
 * 本地部署模式（Local Mode）
 * ------------------------------------------------------------
 * 原版通过 @logto/vue 跳转到 Logto 认证服务完成登录，并拿 OIDC access token。
 * 本地单机部署时没有 Logto，这里改成一个固定的本地身份：
 *   - 始终视为已登录
 *   - getToken() 返回后端约定的本地 token（后端 AuthGuard 直接放行）
 *   - fetchUserInfo() 返回本地用户资料
 *
 * 对外暴露的函数签名与原版完全一致，其它代码无需改动。
 */
const LOCAL_AUTH_TOKEN = "earthworm-local-token";
const LOCAL_USER = {
  sub: "local-user",
  username: "本地学习者",
  name: "本地学习者",
  picture: "/logo.png",
  email: "local@earthworm.local",
  emailVerified: false,
  phoneNumber: null,
  phoneNumberVerified: false,
  roles: [] as string[],
  organizations: [] as string[],
  customData: {},
  identities: {},
};

export async function setupAuth() {
  // 本地模式无需初始化第三方 SDK
}

export async function signIn(callback?: string) {
  // 本地模式下已是登录态，若有回调地址则直接跳转
  callback && setSignInCallback(callback);
}

export function signOut() {
  if (import.meta.client) {
    window.location.href = "/";
  }
}

export function isAuthenticated() {
  return true;
}

export async function getToken() {
  return LOCAL_AUTH_TOKEN;
}

export function fetchUserInfo() {
  return Promise.resolve({ ...LOCAL_USER });
}

export function getSignInCallback() {
  if (!import.meta.client) return "/";

  const callback = sessionStorage.getItem("callback");
  if (callback) {
    sessionStorage.removeItem("callback");
    return callback;
  } else {
    return "/";
  }
}

function setSignInCallback(callback: string) {
  sessionStorage.setItem("callback", callback);
}
