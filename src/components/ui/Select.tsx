import { useId, type SelectHTMLAttributes } from 'react'

type Option<T extends string> = { value: T; label: string }
type SelectProps<T extends string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value'
> & {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  ...rest
}: SelectProps<T>) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-11 rounded-lg border border-divider bg-surface px-3 text-[15px] text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
