import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import Modal from '@cloudscape-design/components/modal'
import SpaceBetween from '@cloudscape-design/components/space-between'
import { useEffect, useState } from 'react'
import { nearService } from '../../services/nearService'
import type { DuplicateGroup } from '../../types/duplicate'
import { formatBytes, formatDate } from '../../utils/format'
import ImageWithPlaceholder from '../loading/ImageWithPlaceholder'
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
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            {onPreviousGroup && <Button iconName="angle-left" onClick={onPreviousGroup}>Previous group</Button>}
            {onNextGroup && <Button iconName="angle-right" iconAlign="right" onClick={onNextGroup}>Next group</Button>}
            <Button variant="primary" onClick={onDismiss}>Done</Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box color="text-body-secondary">
          Up to {formatBytes(group.potential_savings)} can be freed. Arrow keys move between groups.
          {group.file_count > PER_VIEW && ` Showing ${start + 1}–${Math.min(start + PER_VIEW, group.file_count)} of ${group.file_count}.`}
        </Box>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${files.length}, minmax(0, 1fr))`, gap: 16 }}>
          {files.map((e) => (
            <SpaceBetween key={e.entry_id} size="s">
              <ImageWithPlaceholder src={nearService.thumbnailUrl(e.file.google_file_id, 400)} alt={e.file.name} />
              <Box fontWeight="bold">{e.file.name}</Box>
              <KeyValuePairs
                columns={1}
                items={[
                  {
                    label: 'Size',
                    value: <Box variant="span" fontWeight={!sameSize && e.file.size === largest ? 'bold' : 'normal'}>
                      {formatBytes(e.file.size)}{!sameSize && e.file.size === largest ? ' (largest)' : ''}
                    </Box>,
                  },
                  { label: 'Modified', value: <Box variant="span" fontWeight={sameDate ? 'normal' : 'bold'}>{formatDate(e.file.modified_time)}</Box> },
                  { label: 'Created', value: formatDate(e.file.created_time) },
                ]}
              />
              <DecisionControl entry={e} name={e.file.name} />
            </SpaceBetween>
          ))}
        </div>
        {group.file_count > PER_VIEW && (
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled={start === 0} onClick={() => setStart(Math.max(0, start - PER_VIEW))}>Previous photos</Button>
            <Button disabled={start + PER_VIEW >= group.file_count} onClick={() => setStart(start + PER_VIEW)}>More photos</Button>
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Modal>
  )
}
