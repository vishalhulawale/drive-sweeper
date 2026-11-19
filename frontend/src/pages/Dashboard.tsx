import Button from '@cloudscape-design/components/button'
import Container from '@cloudscape-design/components/container'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Grid from '@cloudscape-design/components/grid'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import TypeDonut from '../components/charts/TypeDonut'
import InfoLink from '../components/common/InfoLink'
import Inventory from '../components/dashboard/Inventory'
import NextSteps from '../components/dashboard/NextSteps'
import ScanContainer from '../components/dashboard/ScanContainer'
import SpaceToReclaim from '../components/dashboard/SpaceToReclaim'
import SyncSummary from '../components/dashboard/SyncSummary'
import { useOverview } from '../hooks/useAnalytics'
import { useScans, useStartScan } from '../hooks/useScan'
import { isActive } from '../types/scan'

export default function Dashboard() {
  const scans = useScans()
  const start = useStartScan()
  const scanning = scans.data?.some(isActive) ?? false
  const overview = useOverview()

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink />}
          description="Your Google Drive at a glance, and what you can clean up."
          actions={
            <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending} disabled={!scans.data || scanning}>
              {scans.data?.length ? 'New scan' : 'Start first scan'}
            </Button>
          }
        >
          Dashboard
        </Header>
      }
    >
      <SpaceBetween size="l">
        <SpaceToReclaim />
        <NextSteps />
        <Grid gridDefinition={[{ colspan: { default: 12, m: 6 } }, { colspan: { default: 12, m: 6 } }]}>
          <ScanContainer />
          <SyncSummary scanning={scanning} />
        </Grid>
        <Grid gridDefinition={[{ colspan: { default: 12, m: 7 } }, { colspan: { default: 12, m: 5 } }]}>
          <Inventory refetchMs={scanning ? 4000 : false} />
          <Container header={<Header variant="h2">Storage by type</Header>}>
            <TypeDonut
              size="small"
              categories={overview.data?.categories}
              total={overview.data?.total_bytes}
              status={overview.isError ? 'error' : overview.data ? 'finished' : 'loading'}
              onRetry={() => overview.refetch()}
            />
          </Container>
        </Grid>
      </SpaceBetween>
    </ContentLayout>
  )
}
