import { describe, expect, it } from 'vitest'
import { localMedia } from './mediaCache'

const blob = (mb: number) => new Blob([new Uint8Array(mb * 1024 * 1024)])

describe('local media cache', () => {
  it('stores, returns and deletes blobs', () => {
    const value = blob(1)
    localMedia.set('a', value)
    expect(localMedia.get('a')).toBe(value)
    localMedia.delete('a')
    expect(localMedia.get('a')).toBeUndefined()
  })

  it('evicts the oldest blobs once over the size limit', () => {
    for (let index = 0; index < 5; index++)
      localMedia.set(`big${index}`, blob(15))
    expect(localMedia.get('big0')).toBeUndefined()
    expect(localMedia.get('big1')).toBeUndefined()
    expect(localMedia.get('big4')).toBeDefined()
    for (let index = 0; index < 5; index++) localMedia.delete(`big${index}`)
    expect(localMedia.size).toBe(0)
  })

  it('never evicts the blob that was just added', () => {
    localMedia.set('huge', blob(60))
    expect(localMedia.get('huge')).toBeDefined()
    localMedia.delete('huge')
  })

  it('does not double count a blob that is set twice', () => {
    localMedia.set('x', blob(20))
    localMedia.set('x', blob(20))
    localMedia.set('y', blob(20))
    expect(localMedia.get('x')).toBeDefined()
    localMedia.delete('x')
    localMedia.delete('y')
  })
})
