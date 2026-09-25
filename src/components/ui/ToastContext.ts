import { createContext, useContext } from 'react'

export type ToastKind = 'info' | 'error' | 'success'
export type ToastContextValue = {
  notify: (message: string, kind?: ToastKind) => void
}

export const ToastContext = createContext<ToastContextValue | undefined>(
  undefined,
)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider.')
  return context
}
