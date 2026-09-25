import { useEffect, type RefObject } from 'react'

/**
 * Calls onDismiss on Escape or on a pointer press outside the referenced element(s). Pass several refs when
 * the popup is rendered elsewhere in the DOM (a portal) from its trigger.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  onDismiss: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    const onPointer = (event: PointerEvent) => {
      const refs = Array.isArray(ref) ? ref : [ref]
      const inside = refs.some((item) =>
        item.current?.contains(event.target as Node),
      )
      if (!inside) onDismiss()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [active, onDismiss, ref])
}
