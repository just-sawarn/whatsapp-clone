import { useEffect, useRef, useState } from 'react'

/**
 * True once the element has come within `margin` of the screen, and stays true. Used to hold back downloading media
 * for messages far above the fold until the reader scrolls toward them.
 */
export function useNearViewport<T extends Element>(margin = 400) {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )
  useEffect(() => {
    const element = ref.current
    if (near || !element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { rootMargin: `${margin}px` },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [margin, near])
  return [ref, near] as const
}
