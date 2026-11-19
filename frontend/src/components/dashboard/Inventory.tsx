import type { ReactNode } from 'react'
import { useInventorySummary } from '../../hooks/useFiles'
import { errorMessage } from '../../services/api'
import { formatBytes, formatDate } from '../../utils/format'
import { Alert, Button, KeyValues, Panel, Skeleton } from '../ui/core'

/** Secondary numbers about the Drive; placeholders keep their size until the data arrives. */
export default function Inventory({ refetchMs }: { refetchMs: number | false }) {
  const summary = useInventorySummary(refetchMs)
  const s = summary.data
  const v = (x: ReactNode) => (s ? x : <Skeleton className="h-5 w-20" />)
  const n = (x: number | undefined) => v(<span className="font-semibold" data-numeric>{x?.toLocaleString()}</span>)

  return (
    <Panel title="Inventory" actions={<Button variant="link" to="/files">Browse files</Button>}>
      {summary.isError ? (
        <Alert type="error">{errorMessage(summary.error)}</Alert>
      ) : (
        <KeyValues
          columns={2}
          items={[
            { label: 'Storage used by files', value: v(<span className="font-semibold">{formatBytes(s?.total_size)}</span>) },
            { label: 'Files', value: n(s?.files) },
            { label: 'Folders', value: n(s?.folders) },
            { label: 'Google Docs, Sheets and Slides', value: n(s?.google_docs) },
            { label: 'Shared with you', value: n(s?.shared_with_me) },
            { label: 'In Trash', value: n(s?.trashed) },
            { label: 'All items', value: n(s?.total_items) },
            { label: 'Last full scan', value: v(s?.last_scan_completed_at ? formatDate(s.last_scan_completed_at) : 'None yet') },
          ]}
        />
      )}
    </Panel>
  )
}
