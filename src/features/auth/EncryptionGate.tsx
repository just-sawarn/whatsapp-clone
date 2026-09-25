import { useMemo, useState, type ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { useAuth } from './AuthContext'
import { EncryptionPromptContext } from './EncryptionPromptContext'
import { UnlockEncryptionModal } from './UnlockEncryptionModal'

/** Shows a persistent banner while this device's key is locked or missing, and owns the recovery dialog. */
export function EncryptionGate({ children }: { children: ReactNode }) {
  const { identityState } = useAuth()
  const [open, setOpen] = useState(false)
  const prompt = useMemo(() => ({ open: () => setOpen(true) }), [])
  const blocked = identityState === 'locked' || identityState === 'missing'

  return (
    <EncryptionPromptContext.Provider value={prompt}>
      {blocked && (
        <div
          role="alert"
          className="flex items-center justify-center gap-3 bg-warning px-4 py-2 text-[13px] text-text"
        >
          <Icon icon={LockKeyhole} size={16} />
          <span>
            {identityState === 'missing'
              ? 'This device has no encryption key for your account.'
              : 'Your encryption key is locked, so messages cannot be read yet.'}
          </span>
          <Button
            variant="secondary"
            className="h-8 px-4 text-[13px]"
            onClick={prompt.open}
          >
            {identityState === 'missing' ? 'Restore' : 'Unlock'}
          </Button>
        </div>
      )}
      {children}
      {open && (
        <UnlockEncryptionModal
          key={identityState}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </EncryptionPromptContext.Provider>
  )
}
