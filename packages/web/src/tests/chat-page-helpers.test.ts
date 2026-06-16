import { describe, expect, it } from 'vitest'
import {
  resolveSearchQuery,
  resolveStartConversationQuery,
  shouldLoadMoreHistory
} from '../lib/chat-page-helpers'

describe('chat-page-helpers', () => {
  it('应在输入为空时回退到默认提问', () => {
    expect(resolveStartConversationQuery('')).toBe('请分析这份简历')
    expect(resolveStartConversationQuery('   ')).toBe('请分析这份简历')
  })

  it('应裁剪首尾空白后保留用户输入', () => {
    expect(resolveStartConversationQuery('  请突出项目经历  ')).toBe('请突出项目经历')
  })

  it('应在只附加参考资料时回退到默认参考资料提问', () => {
    expect(resolveSearchQuery('', { hasDocs: true })).toBe('请分析所附资料')
    expect(resolveSearchQuery('', { hasFiles: true })).toBe('请分析所附资料')
    expect(resolveSearchQuery('  重点看岗位匹配  ', { hasDocs: true })).toBe('重点看岗位匹配')
  })

  it('应只在滚动到顶部附近且存在更多历史时触发加载', () => {
    expect(
      shouldLoadMoreHistory(
        { scrollTop: 20, scrollHeight: 1200, clientHeight: 400 },
        { scrollReady: true, hasMoreHistory: true }
      )
    ).toBe(true)

    expect(
      shouldLoadMoreHistory(
        { scrollTop: 20, scrollHeight: 450, clientHeight: 400 },
        { scrollReady: true, hasMoreHistory: true }
      )
    ).toBe(false)

    expect(
      shouldLoadMoreHistory(
        { scrollTop: 20, scrollHeight: 1200, clientHeight: 400 },
        { scrollReady: false, hasMoreHistory: true }
      )
    ).toBe(false)
  })
})
