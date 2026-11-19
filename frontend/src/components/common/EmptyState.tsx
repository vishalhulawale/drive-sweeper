import Box from '@cloudscape-design/components/box'
import SpaceBetween from '@cloudscape-design/components/space-between'
import type { ReactNode } from 'react'

/** Empty table or section: what's missing and the action that fills it. */
export default function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Box textAlign="center" color="inherit" padding={{ vertical: 'l' }}>
      <SpaceBetween size="xs">
        <Box variant="strong" color="inherit">{title}</Box>
        {children && <Box variant="p" color="text-body-secondary">{children}</Box>}
        {action && <Box padding={{ top: 'xs' }}>{action}</Box>}
      </SpaceBetween>
    </Box>
  )
}
