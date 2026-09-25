import { z } from 'zod'

export const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter the name people will see.')
    .max(80, 'Use at most 80 characters.'),
})

export const usernameRule = /^[a-z0-9_]{3,20}$/

export const usernameSchema = z.object({
  username: z
    .string()
    .regex(
      usernameRule,
      'Use 3 to 20 lowercase letters, numbers or underscores.',
    ),
})

export const aboutSchema = z.object({
  about: z.string().trim().max(140, 'Use at most 140 characters.'),
})

/** Keeps typed usernames inside the allowed alphabet as the user types. */
export function normalizeUsername(input: string): string {
  return input
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

export const aboutSuggestions = [
  'Available',
  'Busy',
  'At work',
  'At the gym',
  'Battery about to die',
  'Only urgent calls',
]
