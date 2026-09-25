import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { AuthShell } from './AuthShell'
import { LoginScreen } from './screens/LoginScreen'
import { ResetScreen } from './screens/ResetScreen'
import { SignupScreen } from './screens/SignupScreen'
import { VerifyPendingScreen } from './screens/VerifyPendingScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'

type Screen = 'welcome' | 'login' | 'signup' | 'reset' | 'verify'
const order: Screen[] = ['welcome', 'login', 'signup', 'reset', 'verify']

export default function AuthPage() {
  const { loading, user, clearError } = useAuth()
  const navigate = useNavigate()
  const [screen, setScreen] = useState<Screen>('welcome')
  const [direction, setDirection] = useState(1)
  const [pendingEmail, setPendingEmail] = useState('')

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [loading, navigate, user])

  const go = (next: Screen) => {
    clearError()
    setDirection(order.indexOf(next) >= order.indexOf(screen) ? 1 : -1)
    setScreen(next)
  }

  return (
    <AuthShell>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={screen}
          custom={direction}
          initial={{ opacity: 0, x: 28 * direction }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 * direction }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        >
          {screen === 'welcome' && (
            <WelcomeScreen
              onCreate={() => go('signup')}
              onLogin={() => go('login')}
            />
          )}
          {screen === 'login' && (
            <LoginScreen
              onForgot={() => go('reset')}
              onSignup={() => go('signup')}
            />
          )}
          {screen === 'signup' && (
            <SignupScreen
              onLogin={() => go('login')}
              onConfirmEmail={(email) => {
                setPendingEmail(email)
                go('verify')
              }}
            />
          )}
          {screen === 'reset' && <ResetScreen onBack={() => go('login')} />}
          {screen === 'verify' && (
            <VerifyPendingScreen
              email={pendingEmail}
              onBack={() => go('signup')}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </AuthShell>
  )
}
