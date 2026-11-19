import { useDuplicateSummary } from '../../hooks/useDuplicates'
import { useInventorySummary } from '../../hooks/useFiles'
import { useNearStatus } from '../../hooks/useNear'
import { useTrashOverview } from '../../hooks/useTrash'
import { formatBytes } from '../../utils/format'
import SpaceBar, { type SpacePart } from '../charts/SpaceBar'
import InfoLink from '../common/InfoLink'
import { Button, Panel, Skeleton } from '../ui/core'

/** The dashboard's lead: how much space can be freed, and where from. */
export default function SpaceToReclaim() {
  const summary = useInventorySummary()
  const dups = useDuplicateSummary()
  const near = useNearStatus()
  const trash = useTrashOverview()
  const ready = summary.data && dups.data && near.data && trash.data

  const parts: SpacePart[] = [
    { key: 'similar', label: 'Similar photos', bytes: near.data?.potential_savings ?? 0, color: 'var(--color-chart-1)', href: '/similar' },
    { key: 'dups', label: 'Duplicates', bytes: dups.data?.potential_savings ?? 0, color: 'var(--color-chart-2)', href: '/duplicates' },
    { key: 'trash', label: 'In Trash', bytes: trash.data?.bytes ?? 0, color: 'var(--color-chart-3)', href: '/trash' },
  ]
  const freeable = parts.reduce((s, p) => s + p.bytes, 0)
  const total = (summary.data?.total_size ?? 0) + (trash.data?.bytes ?? 0)

  return (
    <Panel
      title="Space you can free"
      info={<InfoLink />}
      description="From similar photos, exact duplicates, and files already in Drive's Trash."
      actions={
        <>
          <Button to="/duplicates">Review duplicates</Button>
          <Button to="/similar" variant="primary">Review similar photos</Button>
        </>
      }
    >
      {ready ? (
        <div className="flex flex-col gap-4">
          <p>
            <span className="text-4xl font-bold tracking-tight" data-numeric>Up to {formatBytes(freeable)}</span>{' '}
            <span className="text-slate-500">of {formatBytes(total)} in your Drive</span>
          </p>
          <SpaceBar parts={parts} total={total} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-80 max-w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      )}
    </Panel>
  )
}
