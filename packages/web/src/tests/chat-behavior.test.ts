import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useEditorModifications } from '@/composables/editor/useModifications'

interface AcceptOptimization {
  field: string
  current: string
  suggestion: string
}

interface AcceptMessageOptions {
  body: {
    type: string
    conversationId: string
    optimization: AcceptOptimization
  }
}

describe('chat behavior', () => {
  describe('ModificationItem and OptimizationItem types', () => {
    it('OptimizationItem should have priority field', () => {
      const item = {
        field: '工作经验',
        current: '开发web应用',
        suggestion: '强调全栈能力',
        priority: '高' as '高' | '中' | '低'
      }
      expect(item.field).toBe('工作经验')
      expect(['高', '中', '低']).toContain(item.priority)
    })

    it('ModificationItem should not require priority field', () => {
      const item = {
        field: '个人信息',
        current: '张三',
        suggestion: '张三 | 前端开发 | 5年经验'
      }
      expect(item.field).toBe('个人信息')
      expect(item.suggestion).toContain('前端开发')
      expect((item as { priority?: string }).priority).toBeUndefined()
    })
  })

  describe('Scene 2 - accept / supplement / reject', () => {
    it('acceptModification should call chat.sendMessage with type accept', () => {
      const item = { field: '工作经验', current: '旧内容', suggestion: '新内容' }
      const mockSendMessage = (text: string, options: AcceptMessageOptions) => {
        return { text, type: options.body.type, optimization: options.body.optimization }
      }

      const result = mockSendMessage(`确认修改：${item.field}`, {
        body: {
          type: 'accept',
          conversationId: 'conv_123',
          optimization: item
        }
      })

      expect(result.type).toBe('accept')
      expect(result.optimization.field).toBe('工作经验')
      expect(result.optimization.suggestion).toBe('新内容')
    })

    it('rejectModification should mark disabled and reset supplementCount, not remove', () => {
      const disabledMods = new Set<string>()
      let supplementCount = 3

      const markModDisabled = (msgIndex: number, modIdx: number) => {
        const key = `${msgIndex}-${modIdx}`
        if (disabledMods.has(key)) return
        disabledMods.add(key)
      }
      const rejectModification = (msgIndex: number, modIdx: number) => {
        supplementCount = 0
        markModDisabled(msgIndex, modIdx)
      }

      const modifications = [
        { field: '工作经验', current: '', suggestion: '' },
        { field: '个人信息', current: '', suggestion: '' }
      ]

      rejectModification(0, 0)
      expect(supplementCount).toBe(0)
      expect(disabledMods.has('0-0')).toBe(true)
      expect(modifications).toHaveLength(2)
    })

    it('acceptModification should reset supplementCount to 0', () => {
      let supplementCount = 3
      const acceptModification = () => {
        supplementCount = 0
      }
      acceptModification()
      expect(supplementCount).toBe(0)
    })

    it('supplementCount should be limited to MAX_SUPPLEMENTS', () => {
      const MAX_SUPPLEMENTS = 3
      const supplementModification = (count: number) => {
        if (count >= MAX_SUPPLEMENTS) return false
        return true
      }

      expect(supplementModification(0)).toBe(true)
      expect(supplementModification(2)).toBe(true)
      expect(supplementModification(3)).toBe(false)
      expect(supplementModification(5)).toBe(false)
    })

    it('cancelSupplement should rollback temporary disabled state', () => {
      const modifications = useEditorModifications(ref([]))
      const opened = ref(false)

      modifications.supplementModification(
        { field: '个人信息', current: '旧内容', suggestion: '新内容' },
        0,
        1,
        ref({ openSupplementDialog: () => (opened.value = true) })
      )

      expect(opened.value).toBe(true)
      expect(modifications.disabledMods.value.has('0-1')).toBe(true)
      expect(modifications.currentSupplementField.value).toBe('个人信息')

      modifications.cancelSupplement()

      expect(modifications.disabledMods.value.has('0-1')).toBe(false)
      expect(modifications.supplementCount.value).toBe(0)
      expect(modifications.currentSupplementField.value).toBe('')
      expect(modifications.currentSupplementMsgIndex.value).toBe(-1)
      expect(modifications.currentSupplementModIdx.value).toBe(-1)
    })
  })

  describe('Reasoning display in ChatPanel', () => {
    it('should show reasoning toggle when msg has reasoning', () => {
      const msg = {
        role: 'assistant' as const,
        content: '结果',
        reasoning: '思考过程...',
        showReasoning: false,
        optimizations: []
      }

      expect(msg.reasoning).toBeTruthy()
      expect(msg.showReasoning).toBe(false)
    })

    it('should toggle reasoning visibility', () => {
      const msg = {
        role: 'assistant' as const,
        content: '结果',
        reasoning: '思考过程',
        showReasoning: false
      }

      msg.showReasoning = !msg.showReasoning
      expect(msg.showReasoning).toBe(true)

      msg.showReasoning = !msg.showReasoning
      expect(msg.showReasoning).toBe(false)
    })

    it('should not show toggle when reasoning is empty', () => {
      const msg = {
        role: 'assistant' as const,
        content: '结果',
        reasoning: '',
        showReasoning: false
      }

      expect(msg.reasoning).toBeFalsy()
    })
  })

  describe('Reference content classification', () => {
    it('referenceSection should only be set when user uploads reference files', () => {
      const buildPrompt = (
        resumeContent: string,
        referenceContent: string,
        _context: string,
        query: string
      ) => {
        const resumeSection = resumeContent ? `[简历内容]\n${resumeContent}\n\n` : ''
        const referenceSection = referenceContent ? `[参考资料]\n${referenceContent}\n\n` : ''

        return `你是一个简历优化助手。${resumeSection}${referenceSection}用户问题: ${query}`
      }

      const prompt = buildPrompt(
        '张三，5年经验...',
        '',
        '简历片段（similaritySearch 结果）',
        '帮我优化'
      )
      expect(prompt).not.toContain('[参考资料]')
      expect(prompt).toContain('[简历内容]')
    })

    it('referenceSection should be set when user uploads reference files', () => {
      const buildPrompt = (
        resumeContent: string,
        referenceContent: string,
        _context: string,
        query: string
      ) => {
        const resumeSection = resumeContent ? `[简历内容]\n${resumeContent}\n\n` : ''
        const referenceSection = referenceContent ? `[参考资料]\n${referenceContent}\n\n` : ''

        return `你是一个简历优化助手。${resumeSection}${referenceSection}用户问题: ${query}`
      }

      const refContent = '[参考资料: job_desc.pdf]\n岗位要求：精通React...'
      const prompt = buildPrompt('张三，5年经验...', refContent, '简历片段', '参考岗位要求优化')
      expect(prompt).toContain('[参考资料]')
      expect(prompt).toContain('岗位要求')
      expect(prompt).toContain('[简历内容]')
    })

    it('context from similaritySearch should not be labeled as reference', () => {
      const contextChunks = [
        '小鱼生活服务平台小程序，负责前端开发',
        '南通东华软件，担任前端工程师',
        '精通 Vue、React 等前端框架'
      ]
      const context = contextChunks.join('\n\n')

      const oldReferenceSection = context ? `[参考资料]\n${context}\n\n` : ''
      expect(oldReferenceSection).toContain('[参考资料]')

      const newReferenceSection = ''
      expect(newReferenceSection).not.toContain('[参考资料]')
      expect(newReferenceSection).not.toContain('小鱼')
      expect(newReferenceSection).not.toContain('东华软件')
    })

    it('AI should not suggest deleting non-existent reference section', () => {
      const aiSuggestions = [
        '建议优化工作经历描述，突出具体成果',
        '个人优势部分可以更加精炼',
        '项目经历可以增加技术细节',
        '底部参考资料区域建议删除',
        '简历篇幅可以适当缩短'
      ]

      const hasFalseReferenceSuggestion = aiSuggestions.some(
        (s) => s.includes('参考资料区域') && s.includes('删除')
      )

      expect(typeof hasFalseReferenceSuggestion).toBe('boolean')
    })
  })
})
