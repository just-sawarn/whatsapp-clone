import {
  useCallback,
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

export function DropdownMenu({
  items,
  label = 'More options',
  icon = MoreVertical,
  align = 'right',
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, close, open)
  return (
    <div ref={root} className="relative">
      <IconButton
        icon={icon}
        label={label}
        active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      />
      {open && (
        <div
          className={cn(
            'absolute top-11 z-40',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <MenuList items={items} onClose={close} />
        </div>
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
