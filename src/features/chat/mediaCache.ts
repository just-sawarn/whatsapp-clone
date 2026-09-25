/**
 * Plaintext blobs for attachments this device already has: ones I just sent. Lives in memory only, and lets my own
 * uploads render instantly without a download and decrypt round trip. Bounded by size, dropping the oldest first,
 * so a long session of sending photos does not hold them all.
 */
const MAX_BYTES = 48 * 1024 * 1024

class LocalMedia {
  private readonly blobs = new Map<string, Blob>()
  private bytes = 0

  get(id: string): Blob | undefined {
    return this.blobs.get(id)
  }

  set(id: string, blob: Blob): void {
    this.delete(id)
    this.blobs.set(id, blob)
    this.bytes += blob.size
    // Never evict the blob just added, even if it alone is over the limit.
    for (const [oldest, old] of this.blobs) {
      if (this.bytes <= MAX_BYTES || oldest === id) break
      this.blobs.delete(oldest)
      this.bytes -= old.size
    }
  }

  delete(id: string): void {
    const existing = this.blobs.get(id)
    if (!existing) return
    this.blobs.delete(id)
    this.bytes -= existing.size
  }

  get size(): number {
    return this.blobs.size
  }
}

export const localMedia = new LocalMedia()
