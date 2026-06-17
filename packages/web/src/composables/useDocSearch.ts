import { ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { api } from '@/api/client'
import type { DocItem } from '@/types/document'

export function useDocSearch(filters?: { contentCategory?: string; parseStatus?: string }) {
  const showDocPanel = ref(false)
  const docSearch = ref('')
  const docList = ref<DocItem[]>([])
  const docLoading = ref(false)

  async function _search(query: string) {
    docLoading.value = true
    try {
      const params: Record<string, unknown> = { search: query || undefined, pageSize: 8 }
      if (filters?.contentCategory) params.contentCategory = filters.contentCategory
      if (filters?.parseStatus) params.parseStatus = filters.parseStatus
      const res = await api.get<{ data: DocItem[] }, { data: DocItem[] }>('/user-documents', {
        params
      })
      docList.value = res.data || []
    } catch {
      docList.value = []
    } finally {
      docLoading.value = false
    }
  }

  const searchDocs = useDebounceFn(_search, 200)

  function hideDocPanel() {
    showDocPanel.value = false
    docSearch.value = ''
    docList.value = []
  }

  function onInput(ta: HTMLTextAreaElement | null | undefined) {
    if (!ta) return
    const pos = ta.selectionStart || 0
    const text = ta.value
    const lastAt = text.lastIndexOf('@', pos - 1)
    if (lastAt >= 0 && (lastAt === 0 || text[lastAt - 1] === ' ' || text[lastAt - 1] === '\n')) {
      const searchText = text.slice(lastAt + 1, pos)
      if (!searchText.includes(' ') && !searchText.includes('@')) {
        docSearch.value = searchText
        showDocPanel.value = true
        searchDocs(searchText)
        return
      }
    }
    hideDocPanel()
  }

  function clearAtText(ta: HTMLTextAreaElement | null | undefined): string | undefined {
    if (!ta) return undefined
    const pos = ta.selectionStart || 0
    const text = ta.value
    const lastAt = text.lastIndexOf('@', pos - 1)
    if (lastAt < 0) return text

    const nextValue = text.slice(0, lastAt) + text.slice(pos)
    ta.value = nextValue
    ta.selectionStart = lastAt
    ta.selectionEnd = lastAt
    return nextValue
  }

  return {
    showDocPanel,
    docSearch,
    docList,
    docLoading,
    searchDocs,
    hideDocPanel,
    onInput,
    clearAtText
  }
}
