/**
 * 验证「答题时不读、答对后再读」
 * ------------------------------------------------------------
 * 走 CDP 真键盘输入：
 *   1. 关掉 autoPlayEnglish、打开 playAfterCorrect
 *   2. 进游戏页，统计答题前有多少次 /tts/speak 请求
 *   3. 键入正确答案 + 回车
 *   4. 统计答题后是否发出了 /tts/speak
 */
const packId = process.argv[2];
const courseId = process.argv[3];
const answer = process.argv[4] || "i";

const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const target = list.find((t) => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const ttsRequests = [];
const consoleMsgs = [];
let seq = 0;

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = (msg.params.args || [])
      .map((a) => (a.value !== undefined ? a.value : a.description || a.type))
      .join(" ");
    if (text.includes("TTS-TEST") || msg.params.type === "error") consoleMsgs.push(text);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleMsgs.push("EXCEPTION " + (msg.params.exceptionDetails?.text || ""));
  }
  if (msg.method === "Network.requestWillBeSent") {
    const url = msg.params.request.url;
    if (url.includes("/tts/speak")) ttsRequests.push({ at: Date.now(), url: url.slice(0, 120) });
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

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) console.log("eval error:", r.exceptionDetails.text);
  return r.result?.value;
};

await send("Page.enable");
await send("Network.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false,
});

const url = `http://localhost:3000/game/${packId}/${courseId}`;
await send("Page.navigate", { url });
await sleep(2500);

await evaluate(
  `localStorage.setItem('autoPlayEnglish','false'); localStorage.setItem('playAfterCorrect','true'); 'set'`,
);
await send("Page.reload");
await sleep(3000);

const before = ttsRequests.length;
// 挂上探针：记录每次 new Audio / play()，用来区分"预加载"和"真的播了"
await evaluate(
  `(() => {
    window.__log = [];
    const OrigAudio = window.Audio;
    window.Audio = function (src) {
      window.__log.push({ t: Date.now(), kind: 'newAudio', src: String(src).slice(0, 100) });
      return new OrigAudio(src);
    };
    window.Audio.prototype = OrigAudio.prototype;
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__log.push({ t: Date.now(), kind: 'play', src: String(this.src).slice(0, 100) });
      return origPlay.apply(this, arguments);
    };
    return 'hooked';
  })()`,
);
const playsBefore = await evaluate(`window.__log.length`);
const focusOk = await evaluate(
  `(() => { const el = document.querySelector('input[lang="en"]'); if (!el) return 'NO_INPUT'; el.focus(); return 'focused'; })()`,
);

const key = async (opts) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...opts });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...opts });
};

const typed = await evaluate(
  `(() => { window.__answer = ${JSON.stringify(answer)}; return 'ok'; })()`,
);
await evaluate(await (await import("node:fs/promises")).readFile("tools/type-answer.js", "utf8"));
await sleep(300);

const after = ttsRequests.length;
const log = await evaluate(`window.__log`);
const pageState = await evaluate(
  `(() => ({
     url: location.pathname,
     heading: document.querySelector('h1')?.textContent?.trim().slice(0, 40) || '',
     hasNextBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('下一题')),
   }))()`,
);

console.log(
  JSON.stringify(
    {
      focusOk,
      typed,
      playsBeforeAnswer: playsBefore,
      newRequests: ttsRequests.slice(before),
      logAfterHook: log,
      consoleMsgs,
      pageState,
    },
    null,
    2,
  ),
);

ws.close();
