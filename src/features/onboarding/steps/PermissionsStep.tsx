import { useState } from 'react'
import { Bell, Camera, Check } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import {
  notificationPermission,
  requestNotificationPermission,
} from '../../../lib/notifications'
import { StepFrame } from './StepFrame'

type Props = { next: () => void; back: () => void }
type MediaState = 'unknown' | 'granted' | 'denied'

function Card({
  icon,
  title,
  body,
  action,
  done,
}: {
  icon: typeof Bell
  title: string
  body: string
  action: React.ReactNode
  done: boolean
}) {
  return (
    <section className="flex items-start gap-3 rounded-xl border border-divider p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-link">
        <Icon icon={done ? Check : icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-medium">{title}</h2>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
          {body}
        </p>
        <div className="mt-3">{action}</div>
      </div>
    </section>
  )
}

/**
 * Explains why before the browser asks. Both permissions are optional: notifications can be enabled later
 * from Settings, and camera/microphone are requested again when a call or voice note starts.
 */
export function PermissionsStep({ next, back }: Props) {
  const [notifications, setNotifications] = useState(notificationPermission())
  const [media, setMedia] = useState<MediaState>('unknown')

  const askNotifications = async () =>
    setNotifications(await requestNotificationPermission())
  const askMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      })
      stream.getTracks().forEach((track) => track.stop())
      setMedia('granted')
    } catch {
      setMedia('denied')
    }
  }

  return (
    <StepFrame
      title="Stay in the loop"
      description="Turn these on now, or skip and enable them later. You are always in control."
      onBack={back}
      onSubmit={next}
      onSkip={next}
    >
      <Card
        icon={Bell}
        title="Notifications"
        body="Get a heads-up about new messages and incoming calls when this tab is in the background. Previews are built on your device."
        done={notifications === 'granted'}
        action={
          notifications === 'unsupported' ? (
            <p className="text-[13px] text-muted">
              Your browser does not support notifications.
            </p>
          ) : notifications === 'denied' ? (
            <p className="text-[13px] text-muted">
              Blocked. You can change this in your browser&rsquo;s site
              settings.
            </p>
          ) : notifications === 'granted' ? (
            <p className="text-[13px] text-link">Notifications are on.</p>
          ) : (
            <Button variant="secondary" onClick={() => void askNotifications()}>
              Allow notifications
            </Button>
          )
        }
      />
      <Card
        icon={Camera}
        title="Camera and microphone"
        body="Needed for voice notes and for voice and video calls. The camera is only used during video calls."
        done={media === 'granted'}
        action={
          media === 'granted' ? (
            <p className="text-[13px] text-link">
              Camera and microphone are ready.
            </p>
          ) : media === 'denied' ? (
            <p className="text-[13px] text-muted">
              Not available. You will be asked again when you make a call.
            </p>
          ) : (
            <Button variant="secondary" onClick={() => void askMedia()}>
              Check camera and microphone
            </Button>
          )
        }
      />
    </StepFrame>
  )
}
