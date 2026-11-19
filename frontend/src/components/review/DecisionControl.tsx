import { Check, Trash2 } from 'lucide-react'
import { useSelectAction } from '../../hooks/useDuplicates'
import { useNotify } from '../../layouts/notifications'
import { errorMessage } from '../../services/api'
import type { DuplicateAction, DuplicateEntry } from '../../types/duplicate'
import { cx, Segmented } from '../ui/core'

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
          notify({ id: `select-${entry.entry_id}`, type: 'error', header: `Couldn't save your choice for ${name}`, content: errorMessage(e) }),
      },
    )

  return (
    <div className="flex flex-col gap-1">
      <Segmented<DuplicateAction>
        label={`Decision for ${name}`}
        value={chosen}
        onChange={set}
        size="xs"
        options={[
          { value: 'keep', label: 'Keep', icon: <Check size={12} />, tone: 'green' },
          { value: 'trash', label: 'Trash', icon: <Trash2 size={12} />, tone: 'amber' },
        ]}
      />
      <span className={cx('text-xs', chosen === 'trash' ? 'font-semibold text-amber-700 dark:text-amber-400' : chosen === 'keep' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-slate-500')}>
        {chosen === 'trash' ? 'Marked for Trash' : chosen === 'keep' ? 'Keeping' : entry.recommended_action ? `Suggested: ${entry.recommended_action}` : 'No suggestion'}
      </span>
    </div>
  )
}
