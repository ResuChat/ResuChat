import dayjs from 'dayjs'

export function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 0) return '刚刚'
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  return dayjs(ts).format('YYYY-MM-DD')
}

/** 相对于现在的友好时间，如 "3天前"、"刚刚" */
export function formatRelative(ts: number): string {
  return dayjs(ts).fromNow()
}
