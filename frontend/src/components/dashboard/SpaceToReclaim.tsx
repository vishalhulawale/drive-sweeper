import Box from '@cloudscape-design/components/box'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Skeleton from '@cloudscape-design/components/skeleton'
import SpaceBetween from '@cloudscape-design/components/space-between'
import {
  colorChartsPaletteCategorical1, colorChartsPaletteCategorical2, colorChartsPaletteCategorical3,
} from '@cloudscape-design/design-tokens'
import { useDuplicateSummary } from '../../hooks/useDuplicates'
import { useInventorySummary } from '../../hooks/useFiles'
import { useNearStatus } from '../../hooks/useNear'
import { useTrashOverview } from '../../hooks/useTrash'
import { formatBytes } from '../../utils/format'
import SpaceBar, { type SpacePart } from '../charts/SpaceBar'
import InfoLink from '../common/InfoLink'
import { AppButtonLink } from '../common/RouterLink'

/** The dashboard's lead: how much space can be freed, and where from. */
export default function SpaceToReclaim() {
  const summary = useInventorySummary()
  const dups = useDuplicateSummary()
  const near = useNearStatus()
  const trash = useTrashOverview()
  const ready = summary.data && dups.data && near.data && trash.data

  const parts: SpacePart[] = [
    { key: 'similar', label: 'Similar photos', bytes: near.data?.potential_savings ?? 0, color: colorChartsPaletteCategorical1, href: '/similar' },
    { key: 'dups', label: 'Duplicates', bytes: dups.data?.potential_savings ?? 0, color: colorChartsPaletteCategorical2, href: '/duplicates' },
    { key: 'trash', label: 'In Trash', bytes: trash.data?.bytes ?? 0, color: colorChartsPaletteCategorical3, href: '/trash' },
  ]
  const freeable = parts.reduce((s, p) => s + p.bytes, 0)
  const total = (summary.data?.total_size ?? 0) + (trash.data?.bytes ?? 0)

  return (
    <Container
      header={
        <Header
          variant="h2"
          info={<InfoLink />}
          description="From similar photos, exact duplicates, and files already in Drive's Trash."
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <AppButtonLink href="/duplicates">Review duplicates</AppButtonLink>
              <AppButtonLink href="/similar" variant="primary">Review similar photos</AppButtonLink>
            </SpaceBetween>
          }
        >
          Space you can free
        </Header>
      }
    >
      {ready ? (
        <SpaceBetween size="m">
          <div>
            <Box variant="span" fontSize="display-l" fontWeight="bold">Up to {formatBytes(freeable)}</Box>{' '}
            <Box variant="span" color="text-body-secondary">of {formatBytes(total)} in your Drive</Box>
          </div>
          <SpaceBar parts={parts} total={total} />
        </SpaceBetween>
      ) : (
        <SpaceBetween size="m">
          <Skeleton variant="text-display-l" width="320px" />
          <Skeleton height="8px" width="100%" />
          <Skeleton variant="text-body-m" width="420px" />
        </SpaceBetween>
      )}
    </Container>
  )
}
