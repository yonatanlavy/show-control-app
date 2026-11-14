import { createContext, type PropsWithChildren, useContext } from 'react'

const BundledFontsContext = createContext(true)

/** Actual registration, distinct from the bounded permission to reveal idle UI. */
export function FontProvider({ loaded, children }: PropsWithChildren<{ loaded: boolean }>) {
  return <BundledFontsContext.Provider value={loaded}>{children}</BundledFontsContext.Provider>
}

export const useBundledFontsLoaded = () => useContext(BundledFontsContext)
