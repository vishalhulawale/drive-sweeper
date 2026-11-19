import type { ReactNode } from 'react'
import { useCleanupPlan } from '../../hooks/useCleanup'
import { useDuplicateSummary } from '../../hooks/useDuplicates'
import { useNearStatus } from '../../hooks/useNear'
import { useScans } from '../../hooks/useScan'
import { useTrashOverview } from '../../hooks/useTrash'
import { formatBytes } from '../../utils/format'
import { AppLink, cx, Skeleton, Status, type StatusType } from '../ui/core'

interface Step {
  title: string
  status?: [StatusType, string]
  link: ReactNode
}

/** The cleanup workflow as a numbered sequence, each step with its live state and a link. */
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
      link: <AppLink to="/scans">Scan history</AppLink>,
    },
    {
      title: 'Review matches',
      status: dups.data && near.data && (groups ? ['info', `${groups.toLocaleString()} groups to look at`] : ['success', 'Nothing to review']),
      link: <span className="flex gap-3"><AppLink to="/duplicates">Duplicates</AppLink><AppLink to="/similar">Similar photos</AppLink></span>,
    },
    {
      title: 'Move marked files to Trash',
      status: plan.data && (marked ? ['warning', `${marked.toLocaleString()} files, ${formatBytes(plan.data.bytes)}`] : ['stopped', 'Nothing marked']),
      link: <AppLink to="/cleanup">Cleanup</AppLink>,
    },
    {
      title: 'Drive deletes after 30 days',
      status: trash.data && (trash.data.files ? ['info', `${trash.data.files.toLocaleString()} files waiting`] : ['success', 'Trash is empty']),
      link: <AppLink to="/trash">Trash</AppLink>,
    },
  ]

  return (
    <section>
      <h2 className="text-xl font-semibold">Next steps</h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => {
          const done = s.status?.[0] === 'success'
          return (
            <li key={s.title} className={cx('border p-4', done ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-line dark:border-slate-700')}>
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-500">Step {i + 1}</div>
              <div className="font-semibold">{s.title}</div>
              <div className="mt-2 text-sm">{s.status ? <Status type={s.status[0]}>{s.status[1]}</Status> : <Skeleton className="h-4 w-2/3" />}</div>
              <div className="mt-2 text-sm">{s.link}</div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
