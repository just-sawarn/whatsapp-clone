import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveBlob } from './useSaveMedia'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('saveBlob', () => {
  it('clicks a download link carrying the file name, then cleans up', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    const link = {
      href: '',
      download: '',
      rel: '',
      click: vi.fn(),
      remove: vi.fn(),
    }
    const append = vi.fn()
    vi.stubGlobal('document', { createElement: () => link, body: { append } })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x/1')
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)

    saveBlob(new Blob(['data']), 'holiday.jpg')

    expect(link.href).toBe('blob:x/1')
    expect(link.download).toBe('holiday.jpg')
    expect(link.click).toHaveBeenCalledTimes(1)
    expect(link.remove).toHaveBeenCalledTimes(1)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30_000)
    expect(revoke).toHaveBeenCalledWith('blob:x/1')
    vi.useRealTimers()
  })
})
