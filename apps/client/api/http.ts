import type { $Fetch } from "ofetch";

import { useRuntimeConfig } from "#app";
import { ofetch } from "ofetch";

import { getToken } from "~/services/auth";

let http: $Fetch;
let cachedApiBase = "";
export function setupHttp() {
  if (http) return http;

  const config = useRuntimeConfig();
  const baseURL = config.public.apiBase as string;
  cachedApiBase = baseURL;

  http = ofetch.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    async onRequest({ options }) {
      const token = await getToken();
      options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
    },
    async onResponseError({ request, response, options }) {
      const { message } = response._data;
      if (Array.isArray(message)) {
        message.forEach((item) => {
          httpStatusErrorHandler?.(item, response.status);
        });
      } else {
        httpStatusErrorHandler?.(message, response.status);
      }
      return Promise.reject(response._data);
    },
    retry: 3,
    retryDelay: 1000,
  });
}

type HttpStatusErrorHandler = (message: string, statusCode: number) => void;
let httpStatusErrorHandler: HttpStatusErrorHandler;

export function injectHttpStatusErrorHandler(handler: HttpStatusErrorHandler) {
  httpStatusErrorHandler = handler;
}

export function getHttp() {
  if (!http) {
    throw new Error("HTTP client not initialized. Call setupHttp first.");
  }
  return http;
}

/**
 * 后端基地址。发音接口（/tts/speak）要拼成绝对地址交给 <audio> 播放，
 * 而它可能在 setup 之外被调用，所以这里缓存一份 setupHttp 时的值。
 */
export function getApiBase() {
  if (cachedApiBase) return cachedApiBase.replace(/\/$/, "");
  const runtime = (globalThis as any).__NUXT__?.config?.public?.apiBase as string | undefined;
  return (runtime || "").replace(/\/$/, "");
}
