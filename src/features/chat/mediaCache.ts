/**
 * Plaintext blobs for attachments this device already has: ones I just sent, and ones I have downloaded.
 * Lives in memory only, and lets my own uploads render instantly without a download and decrypt round trip.
 */
export const localMedia = new Map<string, Blob>()
