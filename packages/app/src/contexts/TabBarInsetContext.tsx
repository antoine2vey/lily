import { createContext, useContext } from 'react'

const TabBarInsetContext = createContext(0)

export const TabBarInsetProvider = TabBarInsetContext.Provider

export function useTabBarInset() {
  return useContext(TabBarInsetContext)
}
