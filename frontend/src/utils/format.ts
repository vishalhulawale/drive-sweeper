export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDuration(startIso: string, endIso: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const secs = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 1000))
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

export function friendlyType(mime: string): string {
  if (mime === 'application/vnd.google-apps.folder') return 'Folder'
  if (mime === 'application/vnd.google-apps.shortcut') return 'Shortcut'
  if (mime.startsWith('application/vnd.google-apps.')) return 'Google ' + mime.split('.').pop()
  return mime.split('/').pop() ?? mime
}
