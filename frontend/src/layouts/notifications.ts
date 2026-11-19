import type { FlashbarProps } from '@cloudscape-design/components/flashbar'
import { createContext, useContext } from 'react'

/** A notification shown in the page-top Flashbar. Notifications with the same id replace each other. */
export type Notice = Omit<FlashbarProps.MessageDefinition, 'id' | 'onDismiss'> & {
  id: string
  /** Remove automatically after this many milliseconds. */
  autoDismissMs?: number
}

export interface NotificationsApi {
  notify: (n: Notice) => void
  dismiss: (id: string) => void
}

export const NotificationsContext = createContext<NotificationsApi>({ notify: () => {}, dismiss: () => {} })

export const useNotify = () => useContext(NotificationsContext)
