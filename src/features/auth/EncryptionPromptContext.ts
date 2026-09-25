import { createContext, useContext } from 'react'

export type EncryptionPrompt = { open: () => void }

export const EncryptionPromptContext = createContext<EncryptionPrompt>({
  open: () => undefined,
})

export function useEncryptionPrompt(): EncryptionPrompt {
  return useContext(EncryptionPromptContext)
}
