import { useSelectAction } from '../../hooks/useDuplicates'
import { nearService } from '../../services/nearService'
import type { DuplicateEntry } from '../../types/duplicate'
import { formatBytes, formatDate } from '../../utils/format'
import ImageWithPlaceholder from '../loading/ImageWithPlaceholder'
import { Badge, cx, ExternalAnchor } from '../ui/core'
import DecisionControl from './DecisionControl'

/**
 * One photo in a similar-photos group. The copy being kept has a green frame; a copy marked for Trash has an amber
 * frame and is dimmed (full opacity again on hover or focus). Clicking the preview switches Keep/Trash.
 */
export default function PhotoTile({ entry }: { entry: DuplicateEntry }) {
  const select = useSelectAction()
  const f = entry.file
  const chosen = entry.user_selected_action
  const effective = chosen ?? entry.recommended_action
  const keeping = effective === 'keep'
  const trashing = chosen === 'trash'
  const toggle = () => select.mutate({ entryId: entry.entry_id, action: effective === 'keep' ? 'trash' : 'keep' })

  return (
    <div className={cx('min-w-0', trashing && 'dc-photo-trash')} data-entry-id={entry.entry_id} data-photo-tile>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={keeping}
        aria-label={`${f.name}: ${keeping ? 'keeping' : 'not keeping'}. Press to ${keeping ? 'mark for Trash' : 'keep'}.`}
        className={cx(
          'dc-photo-button relative block w-full cursor-pointer border-2 p-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-squid-dark',
          keeping ? 'border-emerald-500' : trashing ? 'border-amber-500' : 'border-line dark:border-slate-700',
        )}
      >
        <ImageWithPlaceholder src={nearService.thumbnailUrl(f.google_file_id)} alt="" bordered={false} />
        <span className="absolute left-1.5 top-1.5">
          {keeping && <Badge color="green">{chosen ? 'Keep' : 'Suggested keep'}</Badge>}
          {trashing && <Badge color="amber">Trash</Badge>}
        </span>
      </button>
      <div className="grid gap-1.5 px-0.5 pt-2">
        <div className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span className="flex-1 truncate font-semibold" title={f.name}>{f.name}</span>
          {f.web_view_link && <ExternalAnchor href={f.web_view_link} label={`Open ${f.name} in Google Drive`} className="shrink-0 text-xs">Drive</ExternalAnchor>}
        </div>
        <span className="text-xs text-slate-500">{formatBytes(f.size)}, modified {formatDate(f.modified_time)}</span>
        <DecisionControl entry={entry} name={f.name} />
      </div>
    </div>
  )
}
