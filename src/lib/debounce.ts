/** Trailing-edge debounce with a cancel handle, for coalescing bursts of realtime events. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: number | undefined
  const debounced = (...args: Args) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), wait)
  }
  debounced.cancel = () => window.clearTimeout(timer)
  return debounced
}
