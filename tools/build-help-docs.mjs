#!/usr/bin/env node
/**
 * 把仓库根目录的说明文档转成站内帮助文档用的 HTML。
 *
 * 用法：
 *   node tools/build-help-docs.mjs          # 生成 apps/client/utils/helpDocs.generated.ts
 *
 * 说明：项目里没有装 markdown 依赖，这里只实现这几份文档用到的语法
 * （标题 / 段落 / 表格 / 有序无序列表 / 引用 / 代码块 / 分割线 / 行内 code、加粗、链接）。
 * 改完根目录的 .md 后跑一次本脚本，前端重新构建即可。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = resolve(ROOT, "apps/client/utils/helpDocs.generated.ts");

const DOCS = [
  {
    slug: "usage",
    file: "使用说明.md",
    summary: "首页看什么、课程进度条怎么算、一键一课怎么学、设置与快捷键、收藏练习",
  },
  {
    slug: "import",
    file: "课程包导入说明.md",
    summary: "网页端上传 CSV、新建课程包、分批导入与追加、封面怎么设、容易踩的坑",
  },
  {
    slug: "deploy",
    file: "部署说明.md",
    summary: "启动与停止、四个服务端口、发音缓存、目录结构、换电脑怎么迁移、常用维护命令",
  },
];

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(text) {
  const codes = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0001${codes.length - 1}\u0001`;
  });

  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );
  out = out.replace(/(?<!href=")(https?:\/\/[^\s<）)，。"']+)/g, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
  });
  out = out.replace(/\u0001(\d+)\u0001/g, (_, index) => `<code>${codes[Number(index)]}</code>`);

  return out;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
}

function isBlockStart(line) {
  const text = line.trim();
  return (
    /^```/.test(text) ||
    /^#{1,6}\s/.test(text) ||
    /^>/.test(text) ||
    /^\|/.test(text) ||
    /^-{3,}$/.test(text) ||
    /^[-*]\s+/.test(text) ||
    /^\d+\.\s+/.test(text)
  );
}

function mdToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let listType = null;
  let title = "";

  function closeList() {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 代码块
    if (/^```/.test(trimmed)) {
      closeList();
      const buffer = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buffer.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre class="md-code"><code>${escapeHtml(buffer.join("\n"))}</code></pre>`);
      continue;
    }

    if (!trimmed) {
      closeList();
      i += 1;
      continue;
    }

    // 表格
    const next = lines[i + 1] ? lines[i + 1].trim() : "";
    if (/^\|.*\|$/.test(trimmed) && /^\|[\s:|-]+\|$/.test(next)) {
      closeList();
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((cell) => {
        const value = cell.trim();
        if (/^:.*:$/.test(value)) return "center";
        if (/^:/.test(value)) return "left";
        if (/:$/.test(value)) return "right";
        return "";
      });
      i += 2;

      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }

      const head = header
        .map((cell, index) => {
          const align = aligns[index] ? ` style="text-align:${aligns[index]}"` : "";
          return `<th${align}>${inline(cell.trim())}</th>`;
        })
        .join("");
      const body = rows
        .map((row) => {
          const cells = row
            .map((cell, index) => {
              const align = aligns[index] ? ` style="text-align:${aligns[index]}"` : "";
              return `<td${align}>${inline(cell.trim())}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");

      out.push(
        `<div class="md-table-wrap"><table class="md-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
      );
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const text = heading[2].trim();
      if (level === 1 && !title) {
        title = text;
      } else {
        out.push(`<h${level} class="md-h md-h${level}">${inline(text)}</h${level}>`);
      }
      i += 1;
      continue;
    }

    // 分割线
    if (/^-{3,}$/.test(trimmed)) {
      closeList();
      out.push('<hr class="md-hr" />');
      i += 1;
      continue;
    }

    // 引用
    if (/^>/.test(trimmed)) {
      closeList();
      const buffer = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) {
        buffer.push(inline(lines[i].trim().replace(/^>\s?/, "")));
        i += 1;
      }
      out.push(
        `<blockquote class="md-quote">${buffer.map((text) => `<p>${text}</p>`).join("")}</blockquote>`,
      );
      continue;
    }

    // 列表
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    const ordered = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (bullet || ordered) {
      const type = bullet ? "ul" : "ol";
      if (listType !== type) {
        closeList();
        out.push(`<${type} class="md-${type}">`);
        listType = type;
      }
      let content = bullet ? bullet[1] : ordered[2];
      i += 1;
      // 缩进续行并入当前列表项
      while (
        i < lines.length &&
        /^\s{2,}\S/.test(lines[i]) &&
        !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
        !isBlockStart(lines[i])
      ) {
        content += lines[i].trim();
        i += 1;
      }
      out.push(`<li>${inline(content)}</li>`);
      continue;
    }

    // 段落：保留作者手写的换行
    closeList();
    const buffer = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buffer.push(inline(lines[i].trim()));
      i += 1;
    }
    out.push(`<p class="md-p">${buffer.join("<br />")}</p>`);
  }

  closeList();
  return { title, html: out.join("\n") };
}

const docs = DOCS.map(({ slug, file, summary }) => {
  const markdown = readFileSync(resolve(ROOT, file), "utf8");
  const { title, html } = mdToHtml(markdown);
  return { slug, title: title || file.replace(/\.md$/, ""), summary, file, html };
});

const banner = `// 此文件由 tools/build-help-docs.mjs 自动生成，请勿手动修改。
// 源文件：仓库根目录的 使用说明.md、课程包导入说明.md、部署说明.md
// 重新生成：node tools/build-help-docs.mjs
`;

const content = `${banner}
export interface HelpDoc {
  slug: string;
  title: string;
  summary: string;
  file: string;
  html: string;
}

export const helpDocs: HelpDoc[] = [
${docs
  .map((doc) => {
    return `  {
    slug: ${JSON.stringify(doc.slug)},
    title: ${JSON.stringify(doc.title)},
    summary: ${JSON.stringify(doc.summary)},
    file: ${JSON.stringify(doc.file)},
    html: ${JSON.stringify(doc.html)},
  },`;
  })
  .join("\n")}
];
`;

writeFileSync(OUT_FILE, content, "utf8");
console.log(`已生成 ${OUT_FILE}`);
docs.forEach((doc) => console.log(`  - ${doc.slug}: ${doc.title} (${doc.html.length} 字符)`));
