// 本地启动器：为 Nitro 服务固定 3000 端口后再加载真正的服务入口
process.env.PORT = "3000";
process.env.NITRO_PORT = "3000";
process.env.HOST = "127.0.0.1";

await import("./.output/server/index.mjs");
