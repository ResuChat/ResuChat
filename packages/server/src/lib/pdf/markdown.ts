import { unified } from 'unified'
import { logger } from '../logger'

import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { toString } from 'mdast-util-to-string'
import type { Root, Heading, RootContent } from 'mdast'

const stringifier = unified().use(remarkStringify)

function stringifyRootContent(node: RootContent): string {
  return stringifier.stringify({ type: 'root', children: [node] } satisfies Root)
}

export function modifySection(
  fullText: string,
  fieldName: string,
  newSectionText: string,
  headingId?: string,
  targetType?: 'heading' | 'content'
): string {
  const tree = unified().use(remarkParse).parse(fullText) as Root
  const children = tree.children

  let targetIdx = -1
  let targetDepth = 0

  if (headingId && /^#[1-9]\d*$/.test(headingId)) {
    const targetNum = parseInt(headingId.slice(1))
    let currentNum = 0
    for (let i = 0; i < children.length; i++) {
      if (children[i].type === 'heading') {
        currentNum++
        if (currentNum === targetNum) {
          targetIdx = i
          targetDepth = (children[i] as Heading).depth
          break
        }
      }
    }
  }

  if (targetIdx === -1) {
    for (let i = 0; i < children.length; i++) {
      const node = children[i]
      if (node.type === 'heading' && toString(node).trim() === fieldName) {
        targetIdx = i
        targetDepth = node.depth
        break
      }
    }
  }

  if (targetIdx === -1) return fullText

  const newTree = unified().use(remarkParse).parse(newSectionText) as Root

  const spliceStart = targetIdx + 1
  let spliceEnd = spliceStart
  while (spliceEnd < children.length) {
    const node = children[spliceEnd]
    if (node.type === 'heading' && (node.depth <= targetDepth || targetIdx === 0)) break
    spliceEnd++
  }

  if (headingId && /^#[1-9]\d*$/.test(headingId)) {
    if (targetType === 'heading') {
      const heading = children[targetIdx] as Heading
      heading.children = newTree.children as unknown as Heading['children']
    } else if (spliceStart === spliceEnd) {
      const heading = children[targetIdx] as Heading
      heading.children = newTree.children as unknown as Heading['children']
    } else {
      const removeCount = spliceEnd - spliceStart
      children.splice(spliceStart, removeCount, ...newTree.children)
    }
  } else {
    if (spliceStart === spliceEnd) {
      const heading = children[targetIdx] as Heading
      heading.children = newTree.children as unknown as Heading['children']
    } else {
      const removeCount = spliceEnd - spliceStart
      children.splice(spliceStart, removeCount, ...newTree.children)
    }
  }

  const result = stringifier.stringify(tree)
  return result
}

export function extractSectionContent(fullText: string, fieldName: string): string {
  const tree = unified().use(remarkParse).parse(fullText) as Root
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type === 'heading' && toString(node).trim() === fieldName) {
      const depth = node.depth
      const parts: string[] = []
      for (let j = i + 1; j < children.length; j++) {
        const child = children[j]
        if (child.type === 'heading' && child.depth <= depth) break
        parts.push(stringifyRootContent(child).trimEnd())
      }
      return parts.join('\n')
    }
  }

  return ''
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function replaceByFlatOffset(
  lines: string[],
  flatFull: string,
  flatOffset: number,
  matchLength: number,
  newContent: string
): string | null {
  let charCount = 0
  let startLine = -1
  let endLine = -1
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length + 1 // \n → ' ' in flat
    if (startLine === -1 && charCount + lineLen > flatOffset) {
      startLine = i
    }
    charCount += lineLen
    if (startLine !== -1 && charCount >= flatOffset + matchLength) {
      endLine = i
      break
    }
  }
  if (startLine === -1) return null
  if (endLine === -1) endLine = lines.length - 1

  const head = startLine > 0 ? lines.slice(0, startLine).join('\n') + '\n' : ''
  const tail = endLine < lines.length - 1 ? '\n' + lines.slice(endLine + 1).join('\n') : ''
  return head + newContent + tail
}

export function tryReplaceText(
  fullText: string,
  current: string,
  newContent: string
): string | null {
  const lines = fullText.split('\n')
  const flatFull = fullText.replace(/\n/g, ' ')
  const normFull = normalize(fullText)
  const normCurrent = normalize(current)
  let idx: number

  // ① 精确匹配
  idx = fullText.indexOf(current)
  if (idx >= 0) {
    return fullText.slice(0, idx) + newContent + fullText.slice(idx + current.length)
  }

  // ② 展平后精确匹配
  idx = flatFull.indexOf(current.trim())
  if (idx >= 0) {
    const result = replaceByFlatOffset(lines, flatFull, idx, current.trim().length, newContent)
    if (result) return result
  }

  // ③ 规范化后匹配
  idx = normFull.indexOf(normCurrent)
  if (idx >= 0) {
    const result = replaceByFlatOffset(lines, flatFull, idx, normCurrent.length, newContent)
    if (result) return result
  }

  // ④ 头尾模糊匹配（规范化后）
  const head = normCurrent.slice(0, 40)
  const tail = normCurrent.slice(-40)
  const headIdx = normFull.indexOf(head)
  if (headIdx === -1) {
    logger.warn('replaceText current head not found, returning original', {
      currentPreview: current.slice(0, 80)
    })
    return null
  }
  const tailIdx = normFull.indexOf(tail, headIdx + head.length)
  if (tailIdx === -1) {
    logger.warn('replaceText current tail not found, returning original', {
      currentPreview: current.slice(0, 80)
    })
    return null
  }

  const matchLen = tailIdx + tail.length - headIdx
  const result = replaceByFlatOffset(lines, flatFull, headIdx, matchLen, newContent)
  if (result) return result

  logger.warn('replaceText all strategies failed, returning original', {
    currentPreview: current.slice(0, 80)
  })
  return null
}

export function replaceText(fullText: string, current: string, newContent: string): string {
  return tryReplaceText(fullText, current, newContent) ?? fullText
}
