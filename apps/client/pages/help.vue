<template>
  <div class="help-page">
    <header class="help-head">
      <h1 class="help-title">帮助文档</h1>
      <p class="help-sub">使用说明、课程包导入、部署维护，随时可查</p>
    </header>

    <div class="help-body">
      <!-- 文档目录 -->
      <aside class="help-nav">
        <button
          v-for="doc in helpDocs"
          :key="doc.slug"
          class="nav-item"
          :class="{ 'is-active': doc.slug === activeSlug }"
          @click="selectDoc(doc.slug)"
        >
          <span class="nav-title">{{ doc.title }}</span>
          <span class="nav-summary">{{ doc.summary }}</span>
        </button>
      </aside>

      <!-- 正文 -->
      <article
        v-if="activeDoc"
        class="help-content"
      >
        <h2 class="doc-title">{{ activeDoc.title }}</h2>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          class="markdown-body"
          v-html="activeDoc.html"
        />
        <p class="doc-foot">
          文档源文件是项目根目录的
          <code>{{ activeDoc.file }}</code
          >，修改后在项目目录运行
          <code>node tools/build-help-docs.mjs</code> 并重新构建前端即可更新此页。
        </p>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { helpDocs } from "~/utils/helpDocs.generated";

const activeSlug = ref(helpDocs[0]?.slug ?? "");
const activeDoc = computed(() => helpDocs.find((doc) => doc.slug === activeSlug.value));

function selectDoc(slug: string) {
  activeSlug.value = slug;
  if (import.meta.client) window.scrollTo({ top: 0, behavior: "smooth" });
}
</script>

<style scoped>
.help-page {
  width: 100%;
  max-width: 1080px;
  margin: 28px auto 72px;
  padding: 0 16px;
}

.help-head {
  margin-bottom: 20px;
}

.help-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #1c1c22;
}

.help-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #8a8a99;
}

.help-body {
  display: flex;
  align-items: flex-start;
  gap: 22px;
}

/* 目录 */
.help-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 240px;
  flex-shrink: 0;
  position: sticky;
  top: 84px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid #e6e6ee;
  border-radius: 12px;
  background-color: #ffffff;
  text-align: left;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.nav-item:hover {
  border-color: #cfc6ff;
}

.nav-item.is-active {
  border-color: #6d4aff;
  background-color: #f7f4ff;
}

.nav-title {
  font-size: 14.5px;
  font-weight: 600;
  color: #26262e;
  line-height: 1.4;
}

.nav-summary {
  font-size: 12px;
  line-height: 1.55;
  color: #9a9aa8;
}

/* 正文 */
.help-content {
  flex: 1;
  min-width: 0;
  padding: 26px 30px 30px;
  border: 1px solid #e6e6ee;
  border-radius: 16px;
  background-color: #ffffff;
}

.doc-title {
  padding-bottom: 14px;
  margin-bottom: 6px;
  border-bottom: 1px solid #eeeef4;
  font-size: 22px;
  font-weight: 700;
  color: #1c1c22;
}

.doc-foot {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px dashed #e6e6ee;
  font-size: 12.5px;
  line-height: 1.7;
  color: #9a9aa8;
}

.doc-foot code {
  padding: 1px 6px;
  border-radius: 5px;
  background-color: #f3f3f8;
  font-family: "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  color: #6d4aff;
}

/* markdown 正文排版 */
.markdown-body {
  font-size: 14.5px;
  line-height: 1.85;
  color: #3a3a46;
}

.markdown-body :deep(.md-h) {
  color: #1c1c22;
  font-weight: 700;
  line-height: 1.5;
}

.markdown-body :deep(.md-h2) {
  margin: 30px 0 12px;
  font-size: 18px;
}

.markdown-body :deep(.md-h3) {
  margin: 22px 0 10px;
  font-size: 15.5px;
  color: #31313c;
}

.markdown-body :deep(.md-h4) {
  margin: 18px 0 8px;
  font-size: 14.5px;
}

.markdown-body :deep(.md-p) {
  margin: 10px 0;
}

.markdown-body :deep(a) {
  color: #6d4aff;
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}

.markdown-body :deep(code) {
  padding: 1.5px 6px;
  border-radius: 5px;
  background-color: #f3f3f8;
  font-family: "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: #c026d3;
}

.markdown-body :deep(.md-code) {
  margin: 14px 0;
  padding: 14px 16px;
  border-radius: 12px;
  background-color: #1e1e26;
  overflow-x: auto;
}

.markdown-body :deep(.md-code code) {
  padding: 0;
  background: transparent;
  color: #e4e4ee;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre;
}

.markdown-body :deep(.md-ul),
.markdown-body :deep(.md-ol) {
  margin: 10px 0;
  padding-left: 22px;
}

.markdown-body :deep(.md-ul) {
  list-style: disc;
}

.markdown-body :deep(.md-ol) {
  list-style: decimal;
}

.markdown-body :deep(li) {
  margin: 5px 0;
}

.markdown-body :deep(.md-quote) {
  margin: 14px 0;
  padding: 10px 16px;
  border-left: 3px solid #d5ccff;
  border-radius: 0 10px 10px 0;
  background-color: #faf8ff;
  color: #5c5c6b;
  font-size: 13.5px;
}

.markdown-body :deep(.md-quote p) {
  margin: 3px 0;
}

.markdown-body :deep(.md-hr) {
  margin: 22px 0;
  border: none;
  border-top: 1px solid #eeeef4;
}

.markdown-body :deep(.md-table-wrap) {
  margin: 14px 0;
  overflow-x: auto;
  border: 1px solid #e6e6ee;
  border-radius: 12px;
}

.markdown-body :deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.markdown-body :deep(.md-table th) {
  padding: 9px 12px;
  background-color: #f7f7fb;
  border-bottom: 1px solid #e6e6ee;
  font-weight: 600;
  color: #26262e;
  text-align: left;
  white-space: nowrap;
}

.markdown-body :deep(.md-table td) {
  padding: 9px 12px;
  border-bottom: 1px solid #f0f0f6;
  vertical-align: top;
  line-height: 1.7;
}

.markdown-body :deep(.md-table tr:last-child td) {
  border-bottom: none;
}

.markdown-body :deep(strong) {
  font-weight: 700;
  color: #1c1c22;
}

/* 深色 */
.dark .help-title {
  color: #f2f2f6;
}

.dark .help-sub {
  color: #8e8e9f;
}

.dark .nav-item {
  border-color: #2c2c36;
  background-color: #1a1a20;
}

.dark .nav-item.is-active {
  border-color: #8b6bff;
  background-color: #221f33;
}

.dark .nav-title {
  color: #ececf2;
}

.dark .nav-summary {
  color: #7c7c8d;
}

.dark .help-content {
  border-color: #2c2c36;
  background-color: #1a1a20;
}

.dark .doc-title {
  border-color: #2c2c36;
  color: #f2f2f6;
}

.dark .doc-foot {
  border-color: #2c2c36;
  color: #7c7c8d;
}

.dark .doc-foot code {
  background-color: #26262f;
  color: #b9a6ff;
}

.dark .markdown-body {
  color: #c9c9d6;
}

.dark .markdown-body :deep(.md-h),
.dark .markdown-body :deep(.md-h3),
.dark .markdown-body :deep(strong) {
  color: #f2f2f6;
}

.dark .markdown-body :deep(.md-code) {
  background-color: #131319;
  border: 1px solid #2c2c36;
}

.dark .markdown-body :deep(code) {
  background-color: #26262f;
  color: #e2a9f2;
}

.dark .markdown-body :deep(.md-quote) {
  border-left-color: #4a3f7a;
  background-color: #201d2c;
  color: #b6b6c6;
}

.dark .markdown-body :deep(.md-hr) {
  border-color: #2c2c36;
}

.dark .markdown-body :deep(.md-table-wrap) {
  border-color: #2c2c36;
}

.dark .markdown-body :deep(.md-table th) {
  background-color: #21212a;
  border-color: #2c2c36;
  color: #ececf2;
}

.dark .markdown-body :deep(.md-table td) {
  border-color: #26262f;
}

@media (max-width: 900px) {
  .help-body {
    flex-direction: column;
    gap: 14px;
  }

  .help-nav {
    position: static;
    flex-direction: row;
    width: 100%;
    overflow-x: auto;
  }

  .nav-item {
    min-width: 190px;
  }

  .help-content {
    padding: 20px 16px 22px;
  }
}
</style>
