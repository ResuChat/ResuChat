<template>
  <div class="editor-skeleton">
    <div class="skeleton-left">
      <div class="skeleton-pdf-header">
        <div class="skeleton-rect w-[100px] h-4" />
      </div>
      <div class="skeleton-pdf-toolbar">
        <div class="skeleton-rect w-[60px] h-3.5" />
        <div class="skeleton-rect w-[140px] h-3.5" />
      </div>
      <div class="skeleton-pdf-body">
        <div class="skeleton-thumbs">
          <div class="skeleton-rect w-full h-[170px]" />
          <div class="skeleton-rect w-full h-[170px]" />
          <div class="skeleton-rect w-full h-[170px]" />
        </div>
        <div class="skeleton-pdf-main" />
      </div>
      <div class="skeleton-pdf-version">
        <div class="skeleton-rect w-[50px] h-6 rounded-xl" />
        <div class="skeleton-rect w-[50px] h-6 rounded-xl" />
        <div class="skeleton-rect w-[50px] h-6 rounded-xl" />
      </div>
    </div>
    <div class="skeleton-right">
      <div class="skeleton-chat">
        <div class="skeleton-rect w-1/2 h-5 mx-4 mb-5 mt-4" />
        <div class="skeleton-rect w-[65%] h-10 mx-3 mb-3.5 ml-auto" />
        <div class="skeleton-rect w-[55%] h-14 mx-3 mb-3.5" />
        <div class="skeleton-rect w-[70%] h-10 mx-3 mb-3.5 ml-auto" />
        <div class="skeleton-rect w-1/2 h-12 mx-3 mb-3.5" />
        <div class="skeleton-rect w-[60%] h-9 mx-3 mb-3.5 ml-auto" />
        <div class="skeleton-rect w-[45%] h-10 mx-3 mb-3.5" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-skeleton {
  display: flex;
  height: 100vh;
}
.skeleton-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--bg-secondary);
}
.skeleton-pdf-header {
  padding-bottom: 8px;
}
.skeleton-pdf-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.skeleton-pdf-body {
  flex: 1;
  display: flex;
  gap: 8px;
  min-height: 0;
}
.skeleton-thumbs {
  width: 160px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.skeleton-pdf-main {
  flex: 1;
  background: var(--border);
  border-radius: 6px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}
.skeleton-pdf-version {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--border);
}
.skeleton-right {
  width: 400px;
  background: var(--bg);
}
.skeleton-chat {
  height: 100%;
  padding-top: 12px;
}
.skeleton-rect {
  background: var(--border);
  border-radius: 6px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
