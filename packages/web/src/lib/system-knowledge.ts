import type { SystemDocumentRecord } from '@resuchat/shared'

export function categoryLabel(row: SystemDocumentRecord): string {
  if (row.index_status !== 'done' && row.category === 'unknown') return '待分类'
  if (row.category === 'resume') return '简历'
  if (row.category === 'job') return '岗位'
  return '其他'
}

export function categoryTagType(value: string): string {
  if (value === 'resume') return 'success'
  if (value === 'job') return 'warning'
  return 'info'
}

export function statusLabel(value: SystemDocumentRecord['index_status']): string {
  if (value === 'pending') return '排队中'
  if (value === 'indexing') return '索引中'
  if (value === 'done') return '已完成'
  return '失败'
}

export function statusTagType(value: SystemDocumentRecord['index_status']): string {
  if (value === 'done') return 'success'
  if (value === 'failed') return 'danger'
  if (value === 'indexing') return 'warning'
  return 'info'
}
