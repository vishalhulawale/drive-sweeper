import TypeDonut from '../components/charts/TypeDonut'
import InfoLink from '../components/common/InfoLink'
import Inventory from '../components/dashboard/Inventory'
import NextSteps from '../components/dashboard/NextSteps'
import ScanContainer from '../components/dashboard/ScanContainer'
import SpaceToReclaim from '../components/dashboard/SpaceToReclaim'
import SyncSummary from '../components/dashboard/SyncSummary'
import { Button, PageHeader, Panel } from '../components/ui/core'
import { useOverview } from '../hooks/useAnalytics'
import { useScans, useStartScan } from '../hooks/useScan'
import { isActive } from '../types/scan'

export default function Dashboard() {
  const scans = useScans()
  const start = useStartScan()
  const scanning = scans.data?.some(isActive) ?? false
  const overview = useOverview()

  return (
    <div>
      <PageHeader
        title="Dashboard"
        info={<InfoLink />}
        description="Your Google Drive at a glance, and what you can clean up. Work through the steps in order: scan, review, then move to Trash."
        actions={
          <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending} disabled={!scans.data || scanning}>
            {scans.data?.length ? 'New scan' : 'Start first scan'}
          </Button>
        }
      />
      <div className="flex flex-col gap-8">
        <SpaceToReclaim />
        <NextSteps />
        <section>
          <h2 className="text-xl font-semibold">Your Drive</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <ScanContainer />
            <SyncSummary scanning={scanning} />
            <Inventory refetchMs={scanning ? 4000 : false} />
            <Panel title="Storage by type" actions={<Button variant="link" to="/analytics">Storage analytics</Button>}>
              <TypeDonut
                categories={overview.data?.categories}
                total={overview.data?.total_bytes}
                status={overview.isError ? 'error' : overview.data ? 'finished' : 'loading'}
                onRetry={() => overview.refetch()}
              />
            </Panel>
          </div>
        </section>
      </div>
    </div>
  )
}
