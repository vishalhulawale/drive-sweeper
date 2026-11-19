import { createContext, useContext, type ReactNode } from 'react'
import type { AlertType } from '../components/ui/core'

/** A notification shown at the top of the page. Notifications with the same id replace each other. */
export interface Notice {
  id: string
  type: AlertType
  header?: ReactNode
  content?: ReactNode
  action?: ReactNode
  /** Shows a spinner; such notices can't be dismissed by hand unless `dismissible` says so. */
  loading?: boolean
  dismissible?: boolean
  /** Remove automatically after this many milliseconds. */
  autoDismissMs?: number
}

export interface NotificationsApi {
  notify: (n: Notice) => void
  dismiss: (id: string) => void
}

export const NotificationsContext = createContext<NotificationsApi>({ notify: () => {}, dismiss: () => {} })

export const useNotify = () => useContext(NotificationsContext)
