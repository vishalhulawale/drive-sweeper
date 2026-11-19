import Badge from '@cloudscape-design/components/badge'
import Box from '@cloudscape-design/components/box'
import Link from '@cloudscape-design/components/link'
import {
  colorBorderDividerDefault, colorBorderItemFocused, colorBorderStatusSuccess, colorBorderStatusWarning,
} from '@cloudscape-design/design-tokens'
import { useSelectAction } from '../../hooks/useDuplicates'
import { nearService } from '../../services/nearService'
import type { DuplicateEntry } from '../../types/duplicate'
import { formatBytes, formatDate } from '../../utils/format'
import ImageWithPlaceholder from '../loading/ImageWithPlaceholder'
import DecisionControl from './DecisionControl'

/**
 * One photo in a similar-photos group. The copy being kept has a green outline; a copy marked for Trash is dimmed
 * (full opacity again on hover or focus so it can still be inspected). Clicking the preview switches Keep/Trash.
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
    <div
      className={`dc-photo${trashing ? ' dc-photo-trash' : ''}`}
      data-entry-id={entry.entry_id}
      data-photo-tile
      style={{ minWidth: 0, ['--dc-focus' as string]: colorBorderItemFocused }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-pressed={keeping}
        aria-label={`${f.name}: ${keeping ? 'keeping' : 'not keeping'}. Press to ${keeping ? 'mark for Trash' : 'keep'}.`}
        className="dc-photo-button"
        style={{
          position: 'relative', display: 'block', width: '100%', padding: 0, cursor: 'pointer', background: 'none',
          borderRadius: 10, border: `2px solid ${keeping ? colorBorderStatusSuccess : trashing ? colorBorderStatusWarning : colorBorderDividerDefault}`,
        }}
      >
        <ImageWithPlaceholder src={nearService.thumbnailUrl(f.google_file_id)} alt="" style={{ border: 'none', borderRadius: 8 }} />
        <span style={{ position: 'absolute', top: 8, left: 8 }}>
          {keeping && <Badge color="green">{chosen ? 'Keep' : 'Suggested keep'}</Badge>}
          {trashing && <Badge color="severity-medium">Trash</Badge>}
        </span>
      </button>
      <div style={{ padding: '8px 2px 0', display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={f.name}>
            <Box variant="span" fontSize="body-s" fontWeight="bold">{f.name}</Box>
          </div>
          {f.web_view_link && (
            <Link href={f.web_view_link} external externalIconAriaLabel="(opens in Google Drive)" fontSize="body-s" ariaLabel={`Open ${f.name} in Google Drive`}>
              Drive
            </Link>
          )}
        </div>
        <Box fontSize="body-s" color="text-body-secondary">{formatBytes(f.size)}, modified {formatDate(f.modified_time)}</Box>
        <DecisionControl entry={entry} name={f.name} />
      </div>
    </div>
  )
}
