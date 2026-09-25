import { useEffect, useRef } from 'react'
import { Camera, CameraOff, Mic, MicOff, PhoneOff } from 'lucide-react'
import type { useWebRTCCall } from './useWebRTCCall'

type CallOverlayProps = { call: ReturnType<typeof useWebRTCCall>; video: boolean; onClose: () => void }

export default function CallOverlay({ call, video, onClose }: CallOverlayProps) {
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)

  useEffect(() => { if (localVideo.current) localVideo.current.srcObject = call.localStream }, [call.localStream])
  useEffect(() => { if (remoteVideo.current) remoteVideo.current.srcObject = call.remoteStream }, [call.remoteStream])

  return <div className="call-overlay"><div className="call-stage">{video && <video ref={remoteVideo} className="remote-video" autoPlay playsInline />}{video && <video ref={localVideo} className="local-video" autoPlay muted playsInline />} {!video && <div className="voice-avatar">☎</div>}<div className="call-status">{call.callState === 'connected' ? 'Connected' : call.callState === 'calling' ? 'Calling...' : call.callState === 'failed' ? 'Call failed' : 'Connecting...'}</div></div><div className="call-controls"><button aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'} onClick={call.toggleMute}>{call.muted ? <MicOff /> : <Mic />}</button>{video && <button aria-label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'} onClick={call.toggleCamera}>{call.cameraOff ? <CameraOff /> : <Camera />}</button>}<button className="end-call" aria-label="End call" onClick={() => { void call.endCall(); onClose() }}><PhoneOff /></button></div></div>
}
