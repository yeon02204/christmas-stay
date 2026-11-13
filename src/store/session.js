import { createContext, useContext } from 'react'

export const SessionContext = createContext({ signOut: () => {} })
export const useSession = () => useContext(SessionContext)
