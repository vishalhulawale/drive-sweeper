import Box from '@cloudscape-design/components/box'
import SegmentedControl from '@cloudscape-design/components/segmented-control'
import SpaceBetween from '@cloudscape-design/components/space-between'
import { useSelectAction } from '../../hooks/useDuplicates'
import { useNotify } from '../../layouts/notifications'
import { errorMessage } from '../../services/api'
import type { DuplicateAction, DuplicateEntry } from '../../types/duplicate'

/**
 * Keep | Trash for one file. Only a chosen "Trash" counts for Cleanup; a suggestion is shown as text until it's
 * chosen (one click, or "Apply suggestions"). Shared by Duplicates and Similar photos.
 */
export default function DecisionControl({ entry, name }: { entry: DuplicateEntry; name: string }) {
  const select = useSelectAction()
  const { notify } = useNotify()
  const chosen = entry.user_selected_action

  const set = (action: DuplicateAction) =>
    select.mutate(
      { entryId: entry.entry_id, action },
      {
        onError: (e) =>
          notify({
            id: `select-${entry.entry_id}`, type: 'error', header: `Couldn't save your choice for ${name}`,
            content: errorMessage(e),
          }),
      },
    )

  return (
    <SpaceBetween size="xxs">
      <SegmentedControl
        label={`Decision for ${name}`}
        selectedId={chosen}
        onChange={(e) => set(e.detail.selectedId as DuplicateAction)}
        options={[
          { id: 'keep', text: 'Keep', iconName: 'check' },
          { id: 'trash', text: 'Trash', iconName: 'remove' },
        ]}
      />
      <Box fontSize="body-s" color={chosen === 'trash' ? 'text-status-warning' : chosen === 'keep' ? 'text-status-success' : 'text-body-secondary'}>
        {chosen === 'trash' ? 'Marked for Trash' : chosen === 'keep' ? 'Keeping' : entry.recommended_action ? `Suggested: ${entry.recommended_action}` : 'No suggestion'}
      </Box>
    </SpaceBetween>
  )
}
