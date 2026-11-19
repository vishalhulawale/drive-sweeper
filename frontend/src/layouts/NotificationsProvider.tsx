import type { ReactNode } from 'react'
import { Alert } from '../components/ui/core'
import { NotificationsContext, type NotificationsApi, type Notice } from './notifications'

export function NotificationsProvider({ value, children }: { value: NotificationsApi; children: ReactNode }) {
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

/** Page-top notices: job progress, results and errors, newest first. */
export function NotificationsBar({ items, onDismiss }: { items: Notice[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null
  return (
    <div className="mb-6 flex flex-col gap-2" aria-live="polite">
      {items.map((n) => (
        <Alert
          key={n.id}
          type={n.loading ? 'in-progress' : n.type}
          header={n.header}
          action={n.action}
          onDismiss={(n.dismissible ?? !n.loading) ? () => onDismiss(n.id) : undefined}
        >
          {n.content}
        </Alert>
      ))}
    </div>
  )
}
