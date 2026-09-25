import { describe, expect, it } from 'vitest'
import { inviteUrl, parseInviteCode } from './communityService'

const code = 'a1b2c3d4e5f6a7b8c9d0e1f2'

describe('invite links', () => {
  it('builds a link and reads the code back from it', () => {
    const link = inviteUrl(code, 'https://chat.example.com')
    expect(link).toBe(`https://chat.example.com/communities/join/${code}`)
    expect(parseInviteCode(link)).toBe(code)
  })

  it('accepts a bare code, with surrounding whitespace, and links with query strings', () => {
    expect(parseInviteCode(`  ${code}  `)).toBe(code)
    expect(
      parseInviteCode(`https://x.test/communities/join/${code}?ref=1#top`),
    ).toBe(code)
  })

  it('rejects anything that is not a plausible code', () => {
    expect(parseInviteCode('')).toBeNull()
    expect(parseInviteCode('short')).toBeNull()
    expect(parseInviteCode('has spaces in the middle of it all')).toBeNull()
    expect(parseInviteCode('https://evil.test/other/path')).toBeNull()
    expect(parseInviteCode(`${code}<script>`)).toBeNull()
  })
})
