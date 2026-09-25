import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatChatTime,
  formatDayLabel,
  formatDuration,
  formatLastSeen,
} from './format'

const now = new Date(2026, 8, 25, 15, 30)
const at = (day: number, hour = 10, minute = 24) =>
  new Date(2026, 8, day, hour, minute).toISOString()

describe('chat timestamps', () => {
  it('shows the time today, then Yesterday, weekday, and date', () => {
    expect(formatChatTime(at(25), now, 'en-US')).toBe('10:24 AM')
    expect(formatChatTime(at(24), now, 'en-US')).toBe('Yesterday')
    expect(formatChatTime(at(21), now, 'en-US')).toBe('Monday')
    expect(formatChatTime(at(1), now, 'en-US')).toBe('09/01/2026')
  })

  it('labels day dividers', () => {
    expect(formatDayLabel(at(25), now, 'en-US')).toBe('Today')
    expect(formatDayLabel(at(24), now, 'en-US')).toBe('Yesterday')
    expect(formatDayLabel(at(1), now, 'en-US')).toBe('September 1, 2026')
  })

  it('describes last seen', () => {
    expect(formatLastSeen(at(25), now, 'en-US')).toBe(
      'last seen today at 10:24 AM',
    )
    expect(formatLastSeen(at(24), now, 'en-US')).toBe(
      'last seen yesterday at 10:24 AM',
    )
    expect(formatLastSeen(at(2), now, 'en-US')).toBe('last seen Sep 2')
  })
})

describe('numbers', () => {
  it('formats durations and sizes', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(75.4)).toBe('1:15')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
