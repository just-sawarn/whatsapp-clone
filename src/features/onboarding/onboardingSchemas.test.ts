import { describe, expect, it } from 'vitest'
import {
  aboutSchema,
  displayNameSchema,
  normalizeUsername,
  usernameSchema,
} from './onboardingSchemas'

describe('normalizeUsername', () => {
  it('lowercases, drops the @ and disallowed characters, and caps the length', () => {
    expect(normalizeUsername('@Some.Name-1')).toBe('somename1')
    expect(normalizeUsername('a'.repeat(30))).toHaveLength(20)
  })
})

describe('onboarding schemas', () => {
  it('validates usernames against the database rule', () => {
    expect(usernameSchema.safeParse({ username: 'ab' }).success).toBe(false)
    expect(usernameSchema.safeParse({ username: 'Has_Caps' }).success).toBe(
      false,
    )
    expect(usernameSchema.safeParse({ username: 'good_name_1' }).success).toBe(
      true,
    )
  })

  it('requires a display name and limits the about text', () => {
    expect(displayNameSchema.safeParse({ displayName: '   ' }).success).toBe(
      false,
    )
    expect(displayNameSchema.safeParse({ displayName: 'Priya' }).success).toBe(
      true,
    )
    expect(aboutSchema.safeParse({ about: 'x'.repeat(141) }).success).toBe(
      false,
    )
  })
})
