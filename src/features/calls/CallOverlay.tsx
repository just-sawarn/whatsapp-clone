import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Icon } from '../../components/ui/Icon'
import { cn } from '../../lib/cn'
import { formatDuration } from '../../lib/format'
import { useChat } from '../chat/useChats'
import { useCall } from './CallContext'
import { endMessage } from './callMachine'

function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [since])
  return since === null ? 0 : Math.max(0, (now - since) / 1000)
}

function RoundButton({
  label,
  onClick,
  active,
  danger,
  success,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  danger?: boolean
  success?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid h-14 w-14 place-items-center rounded-full text-white transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        danger
          ? 'bg-danger'
          : success
            ? 'bg-accent'
            : active
              ? 'bg-white/90 text-black'
              : 'bg-white/15 hover:bg-white/25',
      )}
    >
      {children}
    </button>
  )
}

/** Full-screen call UI: ringing, incoming (accept / decline), in-call controls, and the closing message. */
export function CallOverlay() {
  const call = useCall()
  const { state } = call
  const chat = useChat(state.chatId ?? undefined)
  const elapsed = useElapsed(state.connectedAt)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const remoteAudio = useRef<HTMLAudioElement>(null)
  const localVideo = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (remoteVideo.current) remoteVideo.current.srcObject = call.remoteStream
    if (remoteAudio.current) remoteAudio.current.srcObject = call.remoteStream
  }, [call.remoteStream, state.phase])
  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = call.localStream
  }, [call.localStream, state.phase])

  const visible = state.phase !== 'idle'
  const incoming = state.phase === 'incoming-ringing'
  const finished = state.phase === 'ended' || state.phase === 'failed'
  const showVideo =
    state.video && call.remoteStream !== null && state.phase !== 'ended'

  const status = finished
    ? endMessage(state.endReason)
    : incoming
      ? `Incoming ${state.video ? 'video' : 'voice'} call`
      : state.phase === 'outgoing-ringing'
        ? 'Calling…'
        : state.phase === 'connecting'
          ? 'Connecting…'
          : state.phase === 'reconnecting'
            ? 'Reconnecting…'
            : formatDuration(elapsed)

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="call"
          role="dialog"
          aria-modal="true"
          aria-label={`Call with ${state.peerName}`}
          className="fixed inset-0 z-[80] flex flex-col bg-[#0b141a] text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {showVideo && (
            <video
              ref={remoteVideo}
              autoPlay
              playsInline
              muted={call.speakerMuted}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {!state.video && (
            <audio ref={remoteAudio} autoPlay muted={call.speakerMuted} />
          )}
          {state.video && !showVideo && (
            <audio ref={remoteAudio} autoPlay muted={call.speakerMuted} />
          )}
          <div
            className={cn(
              'relative z-10 flex flex-1 flex-col items-center px-6 pt-14 text-center',
              showVideo &&
                'bg-gradient-to-b from-black/60 to-transparent pb-10',
            )}
          >
            {!showVideo && (
              <div className="relative mt-10">
                {(state.phase === 'outgoing-ringing' || incoming) &&
                  [0, 1].map((ring) => (
                    <motion.span
                      key={ring}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full border-2 border-accent/60"
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 1.7, opacity: 0 }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: ring * 1,
                        ease: 'easeOut',
                      }}
                    />
                  ))}
                <Avatar
                  name={state.peerName}
                  path={chat?.avatarPath}
                  size={148}
                />
              </div>
            )}
            <h1 className="mt-6 text-[28px] font-medium">{state.peerName}</h1>
            <p className="mt-1 text-[16px] text-white/75" aria-live="polite">
              {status}
            </p>
          </div>
          {state.video && call.localStream && !finished && (
            <video
              ref={localVideo}
              autoPlay
              playsInline
              muted
              className={cn(
                'absolute bottom-32 right-4 z-20 h-40 w-28 -scale-x-100 rounded-xl border border-white/20 bg-black object-cover shadow-popover sm:h-48 sm:w-36',
                call.cameraOff && 'opacity-30',
              )}
            />
          )}
          <div className="relative z-10 flex items-center justify-center gap-5 bg-gradient-to-t from-black/60 to-transparent px-6 pb-10 pt-8">
            {incoming ? (
              <>
                <RoundButton
                  label="Decline call"
                  danger
                  onClick={call.declineCall}
                >
                  <Icon icon={PhoneOff} size={26} />
                </RoundButton>
                <RoundButton
                  label={state.video ? 'Accept video call' : 'Accept call'}
                  success
                  onClick={() => void call.acceptCall()}
                >
                  <Icon icon={state.video ? Video : Phone} size={26} />
                </RoundButton>
              </>
            ) : finished ? null : (
              <>
                <RoundButton
                  label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
                  active={call.muted}
                  onClick={call.toggleMute}
                >
                  <Icon icon={call.muted ? MicOff : Mic} size={24} />
                </RoundButton>
                {state.video && (
                  <RoundButton
                    label={
                      call.cameraOff ? 'Turn camera on' : 'Turn camera off'
                    }
                    active={call.cameraOff}
                    onClick={call.toggleCamera}
                  >
                    <Icon icon={call.cameraOff ? VideoOff : Video} size={24} />
                  </RoundButton>
                )}
                <RoundButton
                  label={call.speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
                  active={call.speakerMuted}
                  onClick={call.toggleSpeaker}
                >
                  <Icon
                    icon={call.speakerMuted ? VolumeX : Volume2}
                    size={24}
                  />
                </RoundButton>
                <RoundButton label="End call" danger onClick={call.hangUp}>
                  <Icon icon={PhoneOff} size={26} />
                </RoundButton>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
