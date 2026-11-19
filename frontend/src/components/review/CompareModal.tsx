import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { nearService } from '../../services/nearService'
import type { DuplicateGroup } from '../../types/duplicate'
import { formatBytes, formatDate } from '../../utils/format'
import ImageWithPlaceholder from '../loading/ImageWithPlaceholder'
import { Button, cx, KeyValues } from '../ui/core'
import { Modal } from '../ui/overlay'
import DecisionControl from './DecisionControl'

const PER_VIEW = 4

/** Side-by-side view of a group's photos at a larger size, with the details that differ highlighted. */
export default function CompareModal({
  group, onDismiss, onNextGroup, onPreviousGroup,
}: {
  group: DuplicateGroup | null
  onDismiss: () => void
  onNextGroup?: () => void
  onPreviousGroup?: () => void
}) {
  // Reset to the first photos per group: the parent gives each group its own key.
  const [start, setStart] = useState(0)

  useEffect(() => {
    if (!group) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && onNextGroup) { e.preventDefault(); onNextGroup() }
      if (e.key === 'ArrowLeft' && onPreviousGroup) { e.preventDefault(); onPreviousGroup() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [group, onNextGroup, onPreviousGroup])

  if (!group) return null
  const files = group.files.slice(start, start + PER_VIEW)
  const sizes = group.files.map((e) => e.file.size ?? 0)
  const largest = Math.max(...sizes)
  const sameSize = sizes.every((s) => s === sizes[0])
  const dates = group.files.map((e) => e.file.modified_time ?? '')
  const sameDate = dates.every((d) => d === dates[0])

  return (
    <Modal
      visible
      size="max"
      onDismiss={onDismiss}
      header={`Compare ${group.file_count} similar photos`}
      footer={
        <>
          {onPreviousGroup && <Button icon={<ChevronLeft size={15} />} onClick={onPreviousGroup}>Previous group</Button>}
          {onNextGroup && <Button iconRight={<ChevronRight size={15} />} onClick={onNextGroup}>Next group</Button>}
          <Button variant="primary" onClick={onDismiss}>Done</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-slate-500">
          Up to {formatBytes(group.potential_savings)} can be freed. Arrow keys move between groups.
          {group.file_count > PER_VIEW && ` Showing ${start + 1}–${Math.min(start + PER_VIEW, group.file_count)} of ${group.file_count}.`}
        </p>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${files.length}, minmax(0, 1fr))` }}>
          {files.map((e) => {
            const big = !sameSize && e.file.size === largest
            return (
              <div key={e.entry_id} className="flex flex-col gap-3">
                <ImageWithPlaceholder src={nearService.thumbnailUrl(e.file.google_file_id, 400)} alt={e.file.name} />
                <p className="break-words font-semibold">{e.file.name}</p>
                <KeyValues
                  columns={1}
                  items={[
                    { label: 'Size', value: <span className={cx(big && 'font-bold')}>{formatBytes(e.file.size)}{big ? ' (largest)' : ''}</span> },
                    { label: 'Modified', value: <span className={cx(!sameDate && 'font-bold')}>{formatDate(e.file.modified_time)}</span> },
                    { label: 'Created', value: formatDate(e.file.created_time) },
                  ]}
                />
                <DecisionControl entry={e} name={e.file.name} />
              </div>
            )
          })}
        </div>
        {group.file_count > PER_VIEW && (
          <div className="flex gap-2">
            <Button disabled={start === 0} onClick={() => setStart(Math.max(0, start - PER_VIEW))}>Previous photos</Button>
            <Button disabled={start + PER_VIEW >= group.file_count} onClick={() => setStart(start + PER_VIEW)}>More photos</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
