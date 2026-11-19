import Button from '@cloudscape-design/components/button'
import { useNavigate } from 'react-router-dom'
import { useApplySuggestions, useRestoreSelections, type Selection } from '../../hooks/useDuplicates'
import { useNotify } from '../../layouts/notifications'
import { errorMessage } from '../../services/api'
import type { DuplicateGroup } from '../../types/duplicate'

/**
 * Apply suggestions to groups, then show a notification with Undo (for listed groups) and a link to Cleanup.
 * `label` names the scope in the message, e.g. "3 groups" or "this page".
 */
export function useBulkApply(kind: 'exact' | 'near') {
  const apply = useApplySuggestions(kind)
  const restore = useRestoreSelections()
  const { notify, dismiss } = useNotify()
  const navigate = useNavigate()
  const id = `bulk-${kind}`

  const run = (scope: DuplicateGroup[] | 'all', totalGroups?: number) => {
    const previous: Selection[] | undefined =
      scope === 'all' ? undefined : scope.flatMap((g) => g.files.map((e) => ({ entryId: e.entry_id, action: e.user_selected_action })))
    const marked = scope === 'all'
      ? undefined
      : scope.reduce((n, g) => n + g.files.filter((e) => (e.user_selected_action ?? e.recommended_action) === 'trash').length, 0)
    const groups = scope === 'all' ? totalGroups ?? 0 : scope.length

    apply.mutate(
      { scope: scope === 'all' ? 'all' : scope.map((g) => g.id), previous },
      {
        onSuccess: () =>
          notify({
            id, type: 'success', autoDismissMs: 12000,
            content: marked !== undefined
              ? `Applied suggestions to ${groups.toLocaleString()} group${groups === 1 ? '' : 's'}: ${marked.toLocaleString()} file${marked === 1 ? '' : 's'} marked for Trash.`
              : `Applied suggestions to all ${groups.toLocaleString()} groups.`,
            action: (
              <>
                {previous && (
                  <Button
                    onClick={() => {
                      dismiss(id)
                      restore.mutate(previous, {
                        onSuccess: () => notify({ id, type: 'info', autoDismissMs: 6000, content: 'Undone. Your earlier choices are back.' }),
                        onError: (e) => notify({ id, type: 'error', header: "Couldn't undo", content: errorMessage(e) }),
                      })
                    }}
                  >
                    Undo
                  </Button>
                )}{' '}
                <Button onClick={() => navigate('/cleanup')}>Review in Cleanup</Button>
              </>
            ),
          }),
        onError: (e) => notify({ id, type: 'error', header: "Couldn't apply suggestions", content: errorMessage(e) }),
      },
    )
  }

  return { run, isPending: apply.isPending }
}
