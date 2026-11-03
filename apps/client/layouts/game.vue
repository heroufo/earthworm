<template>
  <div class="game-shell">
    <slot />
  </div>
</template>

<style scoped>
.game-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: linear-gradient(180deg, #a6d3f0 0%, #c0e2f6 34%, #d5ecfb 64%, #e4f3fd 100%);
  color: #1a2b3c;
  font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Segoe UI",
    sans-serif;
  overflow-x: hidden;
}
</style>
