import { createContext, useContext } from 'react'

/** Opens the help panel (the AppLayout tools drawer) for the current page. */
export const HelpContext = createContext<{ openHelp: () => void }>({ openHelp: () => {} })
export const useHelp = () => useContext(HelpContext)
