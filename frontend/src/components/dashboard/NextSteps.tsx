import Box from '@cloudscape-design/components/box'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import StatusIndicator, { type StatusIndicatorProps } from '@cloudscape-design/components/status-indicator'
import type { ReactNode } from 'react'
import { useCleanupPlan } from '../../hooks/useCleanup'
import { useDuplicateSummary } from '../../hooks/useDuplicates'
import { useNearStatus } from '../../hooks/useNear'
import { useScans } from '../../hooks/useScan'
import { useTrashOverview } from '../../hooks/useTrash'
import { formatBytes } from '../../utils/format'
import { AppLink } from '../common/RouterLink'
import Skeleton from '@cloudscape-design/components/skeleton'

interface Step {
  title: string
  status?: [StatusIndicatorProps.Type, string]
  link: ReactNode
}

/** The cleanup workflow as a real sequence, each step with its live state and a link. */
export default function NextSteps() {
  const scans = useScans()
  const dups = useDuplicateSummary()
  const near = useNearStatus()
  const plan = useCleanupPlan()
  const trash = useTrashOverview()

  const scanned = scans.data?.some((s) => s.status === 'completed')
  const groups = (dups.data?.groups ?? 0) + (near.data?.groups ?? 0)
  const marked = plan.data?.count ?? 0

  const steps: Step[] = [
    {
      title: 'Scan your Drive',
      status: scans.data && (scanned ? ['success', 'Done'] : ['pending', 'Not yet']),
      link: <AppLink href="/scans">Scan history</AppLink>,
    },
    {
      title: 'Review matches',
      status: dups.data && near.data && (groups ? ['info', `${groups.toLocaleString()} groups to look at`] : ['success', 'Nothing to review']),
      link: <SpaceBetween direction="horizontal" size="s"><AppLink href="/duplicates">Duplicates</AppLink><AppLink href="/similar">Similar photos</AppLink></SpaceBetween>,
    },
    {
      title: 'Move marked files to Trash',
      status: plan.data && (marked ? ['warning', `${marked.toLocaleString()} files, ${formatBytes(plan.data.bytes)}`] : ['stopped', 'Nothing marked']),
      link: <AppLink href="/cleanup">Cleanup</AppLink>,
    },
    {
      title: 'Drive deletes after 30 days',
      status: trash.data && (trash.data.files ? ['info', `${trash.data.files.toLocaleString()} files waiting`] : ['success', 'Trash is empty']),
      link: <AppLink href="/trash">Trash</AppLink>,
    },
  ]

  return (
    <Container header={<Header variant="h2">Next steps</Header>}>
      <ColumnLayout columns={4} variant="text-grid">
        {steps.map((s, i) => (
          <SpaceBetween key={s.title} size="xxs">
            <Box variant="awsui-key-label">{i + 1}. {s.title}</Box>
            {s.status ? <StatusIndicator type={s.status[0]}>{s.status[1]}</StatusIndicator> : <Skeleton variant="text-body-m" width="70%" />}
            {s.link}
          </SpaceBetween>
        ))}
      </ColumnLayout>
    </Container>
  )
}
