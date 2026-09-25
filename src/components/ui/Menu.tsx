import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useDismiss } from '../../lib/useDismiss'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

export type MenuItem = {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
}

export function MenuList({
  items,
  onClose,
}: {
  items: MenuItem[]
  onClose: () => void
}) {
  return (
    <ul
      role="menu"
      className="min-w-52 rounded-xl bg-surface py-2 text-[14.5px] text-text shadow-popover"
    >
      {items.map((item) => (
        <li
          key={item.label}
          role="none"
          className={cn(
            item.separatorBefore && 'mt-1 border-t border-divider pt-1',
          )}
        >
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
            className={cn(
              'flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40',
              item.danger && 'text-danger',
            )}
          >
            {item.icon && (
              <Icon icon={item.icon} size={18} className="text-muted" />
            )}
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

type DropdownMenuProps = {
  items: MenuItem[]
  label?: string
  icon?: LucideIcon
  align?: 'left' | 'right'
}

const GAP = 4
const EDGE = 8

/**
 * A button that opens a menu. The menu is rendered in a portal and positioned from the button's rectangle, so
 * a parent with `overflow: hidden` or its own scrolling can never clip it. It opens below the button and flips
 * above when there is no room, and closes on scroll or resize (its anchor would have moved).
 */
export function DropdownMenu({
  items,
  label = 'More options',
  icon = MoreVertical,
  align = 'right',
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const trigger = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss([trigger, panel], close, open)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const anchor = trigger.current?.getBoundingClientRect()
    const box = panel.current?.getBoundingClientRect()
    if (!anchor || !box) return
    const preferredLeft =
      align === 'right' ? anchor.right - box.width : anchor.left
    const below = anchor.bottom + GAP
    const fitsBelow = below + box.height <= window.innerHeight - EDGE
    const top = fitsBelow
      ? below
      : Math.max(EDGE, anchor.top - box.height - GAP)
    const left = Math.max(
      EDGE,
      Math.min(preferredLeft, window.innerWidth - box.width - EDGE),
    )
    setPosition({ top, left })
  }, [align, open])

  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [close, open])

  return (
    <div ref={trigger} className="relative">
      <IconButton
        icon={icon}
        label={label}
        active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      />
      {open &&
        createPortal(
          <div
            ref={panel}
            className="fixed z-[60]"
            // Hidden until measured, so it never flashes at the wrong place.
            style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
          >
            <MenuList items={items} onClose={close} />
          </div>,
          document.body,
        )}
    </div>
  )
}

type ContextMenuProps = {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
  header?: ReactNode
}

/** Menu anchored at pointer coordinates (right-click / long-press), clamped inside the viewport. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
  header,
}: ContextMenuProps) {
  const root = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  useDismiss(root, onClose)
  useLayoutEffect(() => {
    const box = root.current?.getBoundingClientRect()
    if (!box) return
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    })
  }, [x, y])
  return createPortal(
    <div ref={root} className="fixed z-[60] grid gap-2" style={position}>
      {header}
      {items.length > 0 && <MenuList items={items} onClose={onClose} />}
    </div>,
    document.body,
  )
}
