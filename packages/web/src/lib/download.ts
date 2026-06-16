/** 触发浏览器下载 */
export function downloadBlob(data: BlobPart, filename: string, mime = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
