/**
 * 用本机 headless Chrome（CDP 9222）截图
 * ------------------------------------------------------------
 * 用法：
 *   node tools/shot.mjs <url> <out.png> [选项]
 * 选项：
 *   --wait=800          页面加载后等待毫秒数（默认 900）
 *   --click=文案         点击包含该文案的按钮/链接
 *   --eval=js 表达式      在点击之后执行
 *   --shot2=<路径>       执行完上面动作后再截一张（比如弹窗）
 *   --after=600          click/eval 之后再等多久（默认 500）
 *   --width=1440 --height=900
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
if (!url || !out) {
  console.error("用法: node tools/shot.mjs <url> <out.png> [--click=文案] [--shot2=路径]");
  process.exit(1);
}

const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const waitMs = Number(opt("wait", 900));
const afterMs = Number(opt("after", 500));
const clickText = opt("click", "");
const evalExprRaw = opt("eval", "");
// --evalFile=xxx.js：表达式太长时放文件里，避免命令行转义地狱
const evalFile = opt("evalFile", "");
const evalExpr = evalFile ? fs.readFileSync(evalFile, "utf8") : evalExprRaw;
const shot2 = opt("shot2", "");
const width = Number(opt("width", 1440));
const height = Number(opt("height", 900));

const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const target = list.find((t) => t.type === "page");
if (!target) throw new Error("没有可用的 page 目标");

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let seq = 0;

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: false,
});

async function screenshot(path) {
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.mkdirSync(path.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
  fs.writeFileSync(path, Buffer.from(data, "base64"));
  console.log("saved", path);
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    console.error(
      "eval error:",
      result.exceptionDetails.text,
      result.exceptionDetails.exception?.description,
    );
  } else {
    const value = result.result?.value;
    if (value !== undefined) console.log("eval →", JSON.stringify(value).slice(0, 300));
  }
  return result;
}

await send("Page.navigate", { url });
await sleep(waitMs);

if (clickText) {
  await evaluate(`(() => {
    const el = [...document.querySelectorAll('button, a, label, summary')]
      .find((node) => (node.textContent || '').replace(/\\s+/g, '').includes(${JSON.stringify(
        clickText.replace(/\s+/g, ""),
      )}));
    if (!el) return 'NOT_FOUND';
    el.click();
    return 'clicked';
  })()`);
  await sleep(afterMs);
}

if (evalExpr) {
  await evaluate(evalExpr);
  await sleep(afterMs);
}

await screenshot(out);
if (shot2) {
  await screenshot(shot2);
}

ws.close();
