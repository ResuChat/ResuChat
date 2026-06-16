// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { renderSafeMarkdown } from '@/lib/markdown'

describe('renderSafeMarkdown', () => {
  it('保留常规 Markdown 排版', () => {
    const html = renderSafeMarkdown('**重点**\n\n- 第一条')

    expect(html).toContain('<strong>重点</strong>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>第一条</li>')
  })

  it('保留安全的 span 高亮样式', () => {
    const html = renderSafeMarkdown('<%span style="color: red; font-weight: 700"%>亮点</%span%>')

    expect(html).toContain('<span')
    expect(html).toContain('color: red')
    expect(html).toContain('font-weight: 700')
    expect(html).toContain('亮点</span>')
  })

  it('过滤脚本、事件属性和危险链接', () => {
    const html = renderSafeMarkdown(
      '<script>alert(1)</script><img src=x onerror=alert(1)> <a href="javascript:alert(1)" onclick="alert(1)">x</a>'
    )

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<a>x</a>')
  })

  it('过滤不在白名单内的 style 能力', () => {
    const html = renderSafeMarkdown(
      '<span style="color: red; position: fixed; background-image: url(javascript:alert(1))">文本</span>'
    )

    expect(html).toContain('color: red')
    expect(html).not.toContain('position')
    expect(html).not.toContain('background-image')
    expect(html).not.toContain('javascript:')
  })
})
