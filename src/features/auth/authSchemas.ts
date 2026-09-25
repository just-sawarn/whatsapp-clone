import { z } from 'zod'

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .email('Enter a valid email address.')

export const loginSchema = z.object({
  email,
  // Existing accounts may predate the current password rules, so log-in only requires something to be typed.
  password: z.string().min(1, 'Enter your password.'),
})

export const signupSchema = z
  .object({
    email,
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .max(72, 'Use at most 72 characters.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match.',
  })

export const resetSchema = z.object({ email })

export type LoginValues = z.infer<typeof loginSchema>
export type SignupValues = z.infer<typeof signupSchema>
export type ResetValues = z.infer<typeof resetSchema>

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  hint: string
}

const labels: PasswordStrength['label'][] = [
  'Too weak',
  'Weak',
  'Fair',
  'Good',
  'Strong',
]
const commonPatterns =
  /(password|qwerty|letmein|welcome|admin|iloveyou|123456|abc123|111111)/i

/**
 * A quick, dependency-free estimate for the sign-up meter. It rewards length and variety and penalises
 * obvious patterns; it is guidance for the user, not a security control.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return { score: 0, label: '', hint: '' }
  let points = 0
  if (password.length >= 8) points++
  if (password.length >= 12) points++
  if (password.length >= 16) points++
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length
  if (classes >= 3) points++
  if (classes === 4) points++
  if (commonPatterns.test(password)) points -= 2
  if (/^(.)\1+$/.test(password) || password.length < 8)
    points = Math.min(points, 1)
  const score = Math.max(
    0,
    Math.min(4, points - 1),
  ) as PasswordStrength['score']
  const hint =
    password.length < 8
      ? 'Use at least 8 characters.'
      : score < 3
        ? 'Add length, capitals, numbers or symbols.'
        : ''
  return { score, label: labels[score] ?? '', hint }
}
