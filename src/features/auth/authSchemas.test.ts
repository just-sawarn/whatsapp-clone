import { describe, expect, it } from 'vitest'
import { loginSchema, passwordStrength, signupSchema } from './authSchemas'

describe('signupSchema', () => {
  it('accepts a valid sign-up', () => {
    expect(
      signupSchema.safeParse({
        email: ' a@b.co ',
        password: 'longenough1',
        confirm: 'longenough1',
      }).success,
    ).toBe(true)
  })

  it('reports each problem on the right field', () => {
    const result = signupSchema.safeParse({
      email: 'nope',
      password: 'short',
      confirm: 'different',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors
      expect(fields.email?.[0]).toMatch(/valid email/)
      expect(fields.password?.[0]).toMatch(/at least 8/)
    }
  })

  it('flags a mismatched confirmation', () => {
    const result = signupSchema.safeParse({
      email: 'a@b.co',
      password: 'longenough1',
      confirm: 'longenough2',
    })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.flatten().fieldErrors.confirm?.[0]).toBe(
        'Passwords do not match.',
      )
  })
})

describe('loginSchema', () => {
  it('does not enforce the new length rule on existing accounts', () => {
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: '123456' }).success,
    ).toBe(true)
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: '' }).success,
    ).toBe(false)
  })
})

describe('passwordStrength', () => {
  it('scores obvious passwords low and long mixed ones high', () => {
    expect(passwordStrength('').score).toBe(0)
    expect(passwordStrength('abc').score).toBe(0)
    expect(passwordStrength('password123').score).toBeLessThanOrEqual(1)
    expect(passwordStrength('aaaaaaaaaaaa').score).toBeLessThanOrEqual(1)
    expect(passwordStrength('Tr1cky-Horse-Battery!').score).toBe(4)
  })

  it('gives a hint until the password is decent', () => {
    expect(passwordStrength('abc').hint).toMatch(/at least 8/)
    expect(passwordStrength('Tr1cky-Horse-Battery!').hint).toBe('')
  })
})
