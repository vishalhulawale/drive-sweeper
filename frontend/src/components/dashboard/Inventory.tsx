import Alert from '@cloudscape-design/components/alert'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import Skeleton from '@cloudscape-design/components/skeleton'
import type { ReactNode } from 'react'
import { useInventorySummary } from '../../hooks/useFiles'
import { errorMessage } from '../../services/api'
import { formatBytes, formatDate } from '../../utils/format'
import { AppLink } from '../common/RouterLink'

/** Secondary numbers about the Drive; placeholders keep their size until the data arrives. */
export default function Inventory({ refetchMs }: { refetchMs: number | false }) {
  const summary = useInventorySummary(refetchMs)
  const s = summary.data
  const v = (x: ReactNode) => (s ? x : <Skeleton variant="text-body-m" width="80px" />)
  const n = (x: number | undefined) => v(<span data-numeric>{x?.toLocaleString()}</span>)

  return (
    <Container header={<Header variant="h2" actions={<AppLink href="/files">Browse files</AppLink>}>Inventory</Header>}>
      {summary.isError ? (
        <Alert type="error">{errorMessage(summary.error)}</Alert>
      ) : (
        <KeyValuePairs
          columns={2}
          items={[
            { label: 'Storage used by files', value: v(formatBytes(s?.total_size)) },
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
    </Container>
  )
}
