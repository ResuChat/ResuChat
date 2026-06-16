<template>
  <div class="h-full flex flex-col">
    <div class="flex justify-between items-center pb-2 flex-shrink-0">
      <span
        >简历预览
        <span v-if="currentVersion" class="ml-2 text-xs text-(--text-muted)">{{
          currentVersion
        }}</span></span
      >
    </div>

    <div class="pdf-toolbar flex justify-between items-center py-2 px-3 flex-shrink-0">
      <!-- 左：页码 -->
      <span class="flex items-center gap-1 whitespace-nowrap text-[13px] text-(--text-secondary)">
        第
        <input
          class="pdf-control-input w-10 text-center px-1 py-0.5 text-[13px] outline-none"
          :value="activeThumb + 1"
          @keydown.enter="jumpTo($event)"
        />
        页 / 共 {{ totalPages }} 页
      </span>
      <!-- 中：缩放 -->
      <div class="flex items-center gap-1">
        <button
          class="toolbar-icon-btn pdf-zoom-btn"
          :disabled="scale <= 0.5"
          title="缩小"
          @click="zoomOut"
        >
          -
        </button>
        <input
          class="pdf-control-input w-[52px] text-center px-1 py-0.5 text-[13px] outline-none"
          :value="Math.round(scale * 100)"
          @keydown.enter="setZoom(($event.target as HTMLInputElement).value)"
          @blur="setZoom(($event.target as HTMLInputElement).value)"
        /><span class="text-[13px] text-(--text-secondary)">%</span>
        <button
          class="toolbar-icon-btn pdf-zoom-btn"
          :disabled="scale >= 3"
          title="放大"
          @click="zoomIn"
        >
          +
        </button>
      </div>
      <!-- 右：操作按钮 -->
      <div>
        <el-button
          v-if="showRestore"
          size="small"
          type="warning"
          plain
          @click="$emit('restore', versions[activeIndex]?.refId)"
        >
          恢复
        </el-button>
        <el-button size="small" type="primary" plain @click="$emit('download')"> 下载 </el-button>
        <el-button
          size="small"
          type="success"
          plain
          @click="$emit('save-to-library', versions[activeIndex]?.refId)"
        >
          入库
        </el-button>
      </div>
    </div>

    <div class="pdf-content flex-1 min-h-0 flex overflow-hidden">
      <div v-if="loading" class="flex flex-col items-center justify-center gap-2 flex-1">
        <el-icon class="animate-spin" :size="32"> <Loading /> </el-icon><span>加载 PDF...</span>
      </div>
      <div v-else-if="error" class="w-full">
        <el-result icon="error" :title="error" />
      </div>
      <template v-else>
        <div
          ref="thumbBar"
          class="w-[160px] min-w-[160px] overflow-y-auto overflow-x-hidden py-2 pl-1 pr-2 flex flex-col gap-1.5"
          style="border-right: 1px solid var(--border)"
        >
          <div
            v-for="i in totalPages"
            :key="'t' + i"
            class="thumb-item flex items-start gap-1 cursor-pointer p-0.5 rounded transition-colors"
            :class="{ 'thumb-item--active': activeThumb === i - 1 }"
            @click="scrollToPage(i - 1)"
          >
            <span class="min-w-[16px] self-center text-right text-[11px] text-(--text-muted)">{{
              i
            }}</span>
            <canvas
              :ref="
                (el) => {
                  if (el) thumbs[i - 1] = el as HTMLCanvasElement
                }
              "
              class="flex-1 cursor-pointer border-2 border-transparent rounded-sm transition-colors"
              :class="{ '!border-(--primary)': activeThumb === i - 1 }"
            />
          </div>
        </div>
        <div ref="containerRef" class="flex-1 min-h-0 overflow-auto py-2 px-2" @scroll="onScroll">
          <div ref="pagesContainer" class="flex flex-col items-center" />
        </div>
      </template>
    </div>

    <div class="version-bar flex justify-between items-center flex-shrink-0 min-h-[34px]">
      <div v-if="versions.length > 1" class="flex gap-2.5">
        <div
          v-for="(v, idx) in versions"
          :key="v.refId"
          class="px-2.5 py-1 rounded-xl text-xs cursor-pointer transition-all select-none border"
          :class="
            idx === activeIndex
              ? '!bg-(--primary) border-(--primary) text-white'
              : 'border-(--border) text-(--text-secondary) hover:border-(--primary)'
          "
          @click="$emit('select-version', idx)"
        >
          {{ v.type === 'original' ? '原始' : 'v' + v.version }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import type { DocVersion } from '@/api'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const props = defineProps<{
  pdfUrl: string
  versions: DocVersion[]
  activeIndex: number
  currentVersion: string
  showRestore: boolean
}>()
defineEmits<{
  download: []
  'select-version': [index: number]
  restore: [refId: number]
  'save-to-library': [refId: number]
}>()

const containerRef = ref<HTMLDivElement>()
const pagesContainer = ref<HTMLDivElement>()
const thumbBar = ref<HTMLDivElement>()
const totalPages = ref(0)
const dpr = window.devicePixelRatio || 1
const scale = ref(1 / dpr)
const loading = ref(false)
const error = ref('')
const activeThumb = ref(0)
const thumbs: HTMLCanvasElement[] = []
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null

async function loadPdf(url: string) {
  loading.value = true
  error.value = ''
  thumbs.length = 0
  activeThumb.value = 0
  try {
    pdfDoc = await pdfjsLib.getDocument({ url, cMapUrl: '/cmaps/', cMapPacked: true }).promise
    totalPages.value = pdfDoc.numPages
    loading.value = false
    await nextTick()
    await nextTick()
    await renderThumbs()
    await renderAllPages()
  } catch (e) {
    console.error('PDF load error:', e)
    error.value = 'PDF 加载失败'
    loading.value = false
  }
}

async function renderThumbs() {
  if (!pdfDoc) return
  const dpr = window.devicePixelRatio || 1
  for (let i = 0; i < pdfDoc.numPages; i++) {
    const canvas = thumbs[i]
    if (!canvas) continue
    const page = await pdfDoc.getPage(i + 1)
    const vp = page.getViewport({ scale: 0.2 * dpr })
    canvas.width = vp.width
    canvas.height = vp.height
    canvas.style.width = vp.width / dpr + 'px'
    canvas.style.height = vp.height / dpr + 'px'
    await page.render({ canvas, viewport: vp }).promise
  }
}

async function renderAllPages() {
  if (!pdfDoc || !pagesContainer.value) return
  pagesContainer.value.innerHTML = ''
  const w = (containerRef.value?.clientWidth || 0) > 100 ? containerRef.value!.clientWidth : 600
  for (let i = 0; i < pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i + 1)
    const natural = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: (w / natural.width) * scale.value * dpr })
    const canvas = document.createElement('canvas')
    canvas.id = 'page-' + i
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.cssText = `width:${viewport.width / dpr}px;height:${viewport.height / dpr}px;display:block;margin:0 auto 16px;box-shadow:0 1px 4px rgba(0,0,0,0.1);`
    pagesContainer.value.appendChild(canvas)
    await page.render({ canvas, viewport }).promise
  }
  await nextTick()
  activeThumb.value = 0
}

function scrollToPage(i: number) {
  const el = document.getElementById('page-' + i)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 缩略图侧边栏：激活页变化时自动滚入可见区
watch(activeThumb, (i) => {
  nextTick(() => {
    const bar = thumbBar.value
    if (!bar) return
    const row = bar.children[i] as HTMLElement | undefined
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
})
function onScroll() {
  const c = containerRef.value
  if (!c) return
  const ps = pagesContainer.value?.children
  if (!ps) return
  const mid = c.scrollTop + c.clientHeight / 2
  for (let i = ps.length - 1; i >= 0; i--) {
    const el = ps[i] as HTMLElement
    if (el.offsetTop <= mid) {
      activeThumb.value = i
      break
    }
  }
}
function jumpTo(e: Event) {
  const n = parseInt((e.target as HTMLInputElement).value)
  if (n >= 1 && n <= totalPages.value) {
    scrollToPage(n - 1)
    ;(e.target as HTMLInputElement).blur()
  }
}
function setZoom(val: string) {
  const n = parseInt(val)
  if (isNaN(n)) return
  scale.value = Math.min(2, Math.max(0.5, n / 100))
  renderAllPages()
}
function zoomIn() {
  scale.value = Math.min(3, scale.value + 0.2)
  renderAllPages()
}
function zoomOut() {
  scale.value = Math.max(0.5, scale.value - 0.2)
  renderAllPages()
}

watch(
  () => props.pdfUrl,
  (url) => {
    if (url) loadPdf(url)
  },
  { immediate: true }
)
onUnmounted(() => {
  pdfDoc?.cleanup()
  if (pagesContainer.value) pagesContainer.value.innerHTML = ''
  thumbs.length = 0
})
</script>

<style scoped>
.pdf-toolbar {
  background: transparent;
}

.pdf-control-input {
  border: 0;
  border-radius: var(--radius-control);
  background: var(--control-bg);
  color: var(--text);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--border) 66%, transparent);
  transition:
    border-color 0.18s,
    box-shadow 0.18s;
}

.pdf-control-input:focus {
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 44%, var(--border));
}

.pdf-zoom-btn {
  width: 28px;
  height: 26px;
  cursor: pointer;
}

.pdf-zoom-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.thumb-item:not(.thumb-item--active):hover {
  background: color-mix(in oklab, var(--primary-bg) 72%, transparent);
}

.thumb-item--active {
  background: color-mix(in oklab, var(--primary-bg) 86%, var(--primary) 14%);
}

.pdf-content {
  margin: 0 -8px 0;
  background: color-mix(in oklab, var(--bg) 82%, var(--pdf-bg) 18%);
}

.version-bar {
  margin: 0 -8px -8px;
  min-height: 49px;
  padding: 8px;
  border-top: 1px solid var(--border);
  background: color-mix(in oklab, var(--bg) 82%, var(--pdf-bg) 18%);
}
</style>
