import Flashbar, { type FlashbarProps } from '@cloudscape-design/components/flashbar'
import type { ReactNode } from 'react'
import { NotificationsContext, type NotificationsApi, type Notice } from './notifications'

export function NotificationsProvider({ value, children }: { value: NotificationsApi; children: ReactNode }) {
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function NotificationsBar({ items, onDismiss }: { items: Notice[]; onDismiss: (id: string) => void }) {
  const defs: FlashbarProps.MessageDefinition[] = items.map(({ autoDismissMs: _ms, ...n }) => ({
    ...n,
    dismissible: n.dismissible ?? !n.loading,
    dismissLabel: 'Dismiss',
    onDismiss: () => onDismiss(n.id),
  }))
  return <Flashbar items={defs} stackItems={defs.length > 3} />
}
