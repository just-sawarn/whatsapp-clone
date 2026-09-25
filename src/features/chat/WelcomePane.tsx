import { Lock, MessageCircle } from 'lucide-react'
import { Icon } from '../../components/ui/Icon'

export default function WelcomePane() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 border-b-[6px] border-accent bg-panel px-8 text-center">
      <span className="grid h-24 w-24 place-items-center rounded-full bg-surface text-muted">
        <Icon icon={MessageCircle} size={44} strokeWidth={1.25} />
      </span>
      <h2 className="mt-2 text-[30px] font-light">WhatsApp for web</h2>
      <p className="max-w-md text-[14.5px] leading-relaxed text-muted">
        Send and receive messages, share photos and files, and call your
        contacts. Choose a chat to get started.
      </p>
      <p className="mt-6 flex items-center gap-1.5 text-[13px] text-muted">
        <Icon icon={Lock} size={13} /> Your personal messages are end-to-end
        encrypted
      </p>
    </div>
  )
}
