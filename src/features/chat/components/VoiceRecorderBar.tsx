import { Send, Trash2 } from 'lucide-react'
import { IconButton } from '../../../components/ui/IconButton'
import { formatDuration } from '../../../lib/format'

type Props = {
  seconds: number
  levels: number[]
  cancelling: boolean
  onCancel: () => void
  onSend: () => void
}

/** Recording strip: cancel, pulsing indicator with timer, live waveform, send. */
export function VoiceRecorderBar({
  seconds,
  levels,
  cancelling,
  onCancel,
  onSend,
}: Props) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5"
      role="status"
      aria-label="Recording voice message"
    >
      <IconButton
        icon={Trash2}
        label="Cancel recording"
        onClick={onCancel}
        className="text-danger"
      />
      <span className="flex items-center gap-2 text-[14px] tabular-nums">
        <span
          className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger"
          aria-hidden="true"
        />
        {formatDuration(seconds)}
      </span>
      <div
        className="flex h-9 min-w-0 flex-1 items-center gap-[3px] overflow-hidden"
        aria-hidden="true"
      >
        {levels.map((level, index) => (
          <span
            key={index}
            className="w-[3px] shrink-0 rounded-full bg-muted"
            style={{ height: `${Math.max(12, level * 100)}%` }}
          />
        ))}
      </div>
      <span className="hidden text-[12.5px] text-muted sm:block">
        {cancelling ? 'Release to cancel' : '← Slide to cancel'}
      </span>
      <IconButton
        icon={Send}
        label="Send voice message"
        tone="primary"
        onClick={onSend}
      />
    </div>
  )
}
