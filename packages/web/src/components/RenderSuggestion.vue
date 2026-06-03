<template>
  <div>
    <div
      v-for="(block, bi) in blocks"
      :key="bi"
      :class="block.type === 'list' ? 'flex gap-1.5 mb-0.5' : 'mb-1.5 leading-[1.6]'"
    >
      <span v-if="block.type === 'list'" class="shrink-0">•</span>
      <span>
        <template v-for="(seg, si) in block.segs" :key="si">
          <strong v-if="seg.b">{{ seg.t }}</strong>
          <span v-else :style="seg.s">{{ seg.t }}</span>
        </template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string }>()

function parseInlineStyle(styleStr: string): Record<string, any> {
  const result: Record<string, any> = {}
  for (const rule of styleStr.split(';')) {
    const [k, v] = rule.split(':').map((s) => s.trim())
    if (!k || !v) continue
    if (k === 'font-size') {
      const n = parseFloat(v)
      result.fontSize = (v.endsWith('em') ? Math.round(n * 10) : n) + 'px'
    } else if (k === 'color') result.color = v
    else if (k === 'font-weight' && v === 'bold') result.fontWeight = 'bold'
    else if (k === 'background-color') result.backgroundColor = v
    else if (k === 'text-decoration') result.textDecoration = v === 'underline' ? 'underline' : v
  }
  return result
}

function parseInline(text: string): { t: string; b?: boolean; s?: Record<string, any> }[] {
  const segments: { t: string; b?: boolean; s?: Record<string, any> }[] = []
  // 归一化 LLM 常见的标签格式错误
  text = text.replace(/<\/%(span)>/g, '</%span%>')
  const spanRe = /<%(span)(?:\s+style="([^"]*)")?\s*%>([\s\S]*?)<\/%\1%>/g
  let last = 0
  let m: RegExpExecArray | null

  let matchCount = 0
  while ((m = spanRe.exec(text)) !== null) {
    matchCount++
    if (m.index > last) pushBold(segments, text.slice(last, m.index))
    segments.push({ t: m[3], s: m[2] ? parseInlineStyle(m[2]) : undefined })
    last = m.index + m[0].length
  }
  if (last < text.length) pushBold(segments, text.slice(last))
  if (segments.length === 0) segments.push({ t: text })
  return segments
}

function pushBold(segments: { t: string; b?: boolean; s?: Record<string, any> }[], text: string) {
  let last = 0
  const re = /\*\*(.+?)\*\*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ t: text.slice(last, m.index) })
    segments.push({ t: m[1], b: true })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ t: text.slice(last) })
}

const blocks = computed(() => {
  const result: {
    type: 'para' | 'list'
    segs: { t: string; b?: boolean; s?: Record<string, any> }[]
  }[] = []
  for (const block of props.text.split('\n\n')) {
    const trimmed = block.trim()
    if (!trimmed) continue
    for (const line of trimmed.split('\n')) {
      const listMatch = line.match(/^[-*+]\s+(.+)$/)
      if (listMatch) {
        result.push({ type: 'list', segs: parseInline(listMatch[1]) })
      } else {
        result.push({ type: 'para', segs: parseInline(line) })
      }
    }
  }
  return result
})
</script>
