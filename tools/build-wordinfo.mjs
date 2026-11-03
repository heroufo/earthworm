/**
 * 从 ECDICT 提取本项目用到的单词信息（词性 + 简短中文释义 + 音标），
 * 输出紧凑 JSON 给前端做逐词拆解展示。
 *
 * ECDICT 的 pos 列是空的，词性从 translation 每段开头的 "n." / "v." / "adj." 提取。
 * 注：ECDICT 的换行在字段内是字面量 "\n"（反斜杠 + n），不是真正的换行符。
 *
 * 用法：node tools/build-wordinfo.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DICT_CSV = path.resolve(ROOT, "../.tmp-dict/ecdict.csv");
const OUT = path.resolve(ROOT, "apps/client/public/dict/wordinfo.json");

// ---------- 1. 取出项目里出现的所有英文单词 ----------
const psql = path.join(ROOT, "tools/pgsql/bin/psql.exe");
const raw = execFileSync(
  psql,
  [
    "-h",
    "127.0.0.1",
    "-p",
    "5433",
    "-U",
    "postgres",
    "-d",
    "earthworm",
    "-t",
    "-A",
    "-c",
    "select english from statements;",
  ],
  { encoding: "utf8", env: { ...process.env, PGCLIENTENCODING: "UTF8" } },
);

const words = new Set();
for (const line of raw.split(/\r?\n/)) {
  const sentence = line.trim();
  if (!sentence) continue;
  for (const token of sentence.split(/\s+/)) {
    const w = token.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "");
    if (w) words.add(w);
  }
}
console.log(`[1] 句子中的唯一单词：${words.size} 个`);

// ---------- 2. 扫描 ECDICT（状态机，正确处理引号内换行） ----------
if (!fs.existsSync(DICT_CSV)) throw new Error(`词典不存在：${DICT_CSV}`);
const text = fs.readFileSync(DICT_CSV, "utf8");

// ECDICT 混用两套词性缩写：中文释义行偏传统语法（n./v./vi./a.），
// 英文释义行偏 WordNet（n./v./a./s./r.），两套都要认。
const POS_LABEL = {
  n: "名词",
  v: "动词",
  vt: "动词",
  vi: "动词",
  adj: "形容词",
  a: "形容词",
  s: "形容词",
  adv: "副词",
  r: "副词",
  ad: "副词",
  prep: "介词",
  pron: "代词",
  conj: "连词",
  num: "数词",
  art: "冠词",
  int: "感叹词",
  aux: "助动词",
  abbr: "缩写",
};

// 高频功能词在词典里往往取到偏门义项，这里人工校正（也符合图片里逐词标注的做法）
const POS_OVERRIDE = {
  more: "形容词",
  most: "形容词",
  less: "形容词",
  very: "副词",
  the: "冠词",
  a: "冠词",
  an: "冠词",
  to: "介词",
  of: "介词",
  in: "介词",
  on: "介词",
  at: "介词",
  for: "介词",
  with: "介词",
  from: "介词",
  about: "介词",
  by: "介词",
  as: "介词",
  into: "介词",
  and: "连词",
  but: "连词",
  or: "连词",
  so: "连词",
  because: "连词",
  if: "连词",
  be: "动词",
  am: "动词",
  is: "动词",
  are: "动词",
  was: "动词",
  were: "动词",
  been: "动词",
  do: "助动词",
  does: "助动词",
  did: "助动词",
  will: "助动词",
  would: "助动词",
  can: "助动词",
  could: "助动词",
  should: "助动词",
  must: "助动词",
  may: "助动词",
  might: "助动词",
  shall: "助动词",
  i: "代词",
  you: "代词",
  he: "代词",
  she: "代词",
  it: "代词",
  we: "代词",
  they: "代词",
  me: "代词",
  him: "代词",
  her: "代词",
  us: "代词",
  them: "代词",
  this: "代词",
  that: "代词",
  these: "代词",
  those: "代词",
  my: "代词",
  your: "代词",
  his: "代词",
  its: "代词",
  our: "代词",
  their: "代词",
  there: "副词",
  here: "副词",
};

/** 从释义里取词性：看每段开头的 "n." / "v." / "adj." */
function pickPos(translation) {
  for (const seg of translation.split(/\\n|\n/)) {
    const m = seg.trim().match(/^([a-z]{1,5})\.\s/);
    if (m && POS_LABEL[m[1]]) return POS_LABEL[m[1]];
  }
  return "";
}

/** 取释义第一段，去掉词性前缀，压到 14 字以内 */
function shortTranslation(translation) {
  const firstLine = translation.split(/\\n|\n/)[0].trim();
  const noPos = firstLine.replace(/^[a-z]{1,5}\.\s*/i, "").trim();
  const first = noPos.split(/[；;，,、]/)[0].trim();
  const result = first || noPos;
  return result.length > 14 ? result.slice(0, 14) : result;
}

const header = [];
const dict = new Map();

let field = "";
let fields = [];
let quoted = false;
let isHeader = true;

function flushRow() {
  fields.push(field);
  field = "";
  if (isHeader) {
    header.push(...fields);
    isHeader = false;
    fields = [];
    return;
  }
  const word = (fields[0] || "").toLowerCase();
  if (word && words.has(word) && !dict.has(word)) {
    const iPhonetic = header.indexOf("phonetic");
    const iTrans = header.indexOf("translation");
    const translation = fields[iTrans] || "";
    dict.set(word, {
      pos: POS_OVERRIDE[word] || pickPos(translation),
      t: shortTranslation(translation),
      p: (fields[iPhonetic] || "").trim(),
    });
  }
  fields = [];
}

for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (quoted) {
    if (ch === '"') {
      if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else field += ch;
  } else if (ch === '"') quoted = true;
  else if (ch === ",") {
    fields.push(field);
    field = "";
  } else if (ch === "\n") flushRow();
  else if (ch !== "\r") field += ch;
}
if (field || fields.length) flushRow();

console.log(`[2] 词典命中：${dict.size} / ${words.size}`);

// 变形词（is / went / children…）的释义常写成「be的现在式第三人称」，回填原形释义
const INFLECT =
  /^(.+?)的(过去式|现在式|现在时|过去时|第三人称|第一人称|第二人称|单数|复数|过去分词|现在分词|比较级|最高级)/;
let inflectFixed = 0;
for (const [, info] of dict) {
  const matched = info.t.match(INFLECT);
  if (!matched) continue;
  const base = dict.get(matched[1].toLowerCase());
  if (!base) continue;
  if (base.t && base.t !== info.t) {
    info.t = base.t;
    inflectFixed += 1;
  }
  // 变形词本身往往没有词性标注，跟随原形
  if (!info.pos && base.pos) info.pos = base.pos;
}
console.log(`[2.1] 变形词释义回填：${inflectFixed} 个`);

// ---------- 3. 输出 ----------
const result = {};
for (const [w, v] of [...dict.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  result[w] = [v.pos, v.t, v.p];
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result), "utf8");
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`[3] 已写入 ${OUT}（${kb} KB，${Object.keys(result).length} 词）`);

const missing = [...words].filter((w) => !dict.has(w));
if (missing.length) {
  console.log(`[4] 未命中 ${missing.length} 个：${missing.slice(0, 40).join(", ")}`);
}
const noPos = [...dict.values()].filter((v) => !v.pos).length;
console.log(`[5] 其中无词性 ${noPos} 个（界面上不显示词性标签）`);
