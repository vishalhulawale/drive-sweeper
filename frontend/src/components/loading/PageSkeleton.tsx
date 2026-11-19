import { Skeleton } from '../ui/core'
import { useDelayedFlag } from './useDelayedFlag'

/** Placeholder lines shaped like a block of text. */
export function TextSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}

/** A panel-shaped placeholder: header line plus body lines. */
export function ContainerSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="border border-line dark:border-slate-700">
      <div className="border-b border-line px-4 py-3 dark:border-slate-700"><Skeleton className="h-5 w-1/3" /></div>
      <div className="p-4"><TextSkeleton lines={lines} /></div>
    </div>
  )
}

/** Shown while a page's code loads: the page frame with placeholders, after a short delay to avoid a flash. */
export default function PageSkeleton() {
  const show = useDelayedFlag(true)
  if (!show) return null
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-60" />
      <ContainerSkeleton lines={2} />
      <ContainerSkeleton lines={5} />
    </div>
  )
}
