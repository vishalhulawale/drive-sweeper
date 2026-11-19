import Container from '@cloudscape-design/components/container'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Skeleton from '@cloudscape-design/components/skeleton'
import SpaceBetween from '@cloudscape-design/components/space-between'
import { useDelayedFlag } from './useDelayedFlag'

/** Placeholder lines shaped like a block of text. */
export function TextSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <SpaceBetween size="xs">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text-body-m" width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </SpaceBetween>
  )
}

/** A container-shaped placeholder: header line plus body lines. */
export function ContainerSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Container header={<Skeleton variant="text-heading-m" width="30%" />}>
      <TextSkeleton lines={lines} />
    </Container>
  )
}

/** Shown while a page's code loads: the page frame with placeholders, after a short delay to avoid a flash. */
export default function PageSkeleton() {
  const show = useDelayedFlag(true)
  if (!show) return null
  return (
    <ContentLayout header={<Skeleton variant="text-heading-xl" width="240px" />}>
      <SpaceBetween size="l">
        <ContainerSkeleton lines={2} />
        <ContainerSkeleton lines={5} />
      </SpaceBetween>
    </ContentLayout>
  )
}
