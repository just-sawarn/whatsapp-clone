# WhatsApp Web Clone

A private, end-to-end encrypted messenger for the web. React 18 + Vite + TypeScript + Tailwind on the front end; Supabase (Postgres with Row Level Security, Auth, Realtime, Storage, Edge Functions) on the back end; WebRTC for voice and video calls.

## What is in it

| Area | Features |
| --- | --- |
| Accounts | Email/password sign-up with strength meter, email verification, password reset, animated multi-step onboarding (photo, name, `@username`, about, permissions priming, key generation) |
| Chat | 1:1 and group chats, realtime delivery, sent/delivered/read ticks, typing and online/last-seen, unread badges, pin (max 3) / archive / mute / mark unread, filters, chat and message search |
| Messages | Text, photos, files, voice notes (live waveform), emoji, reply, forward, delete for me / for everyone (1 hour), star, reactions, link previews, drag-and-drop and paste |
| Groups | Create from usernames, add/remove members, admins, rename, leave (admin hands over automatically), 256 members |
| Contacts | Discovery by exact `@username` or email (server-enforced privacy setting), contact list, blocking |
| Status | 24-hour text and photo statuses, story viewer, viewers list, audience = mutual contacts |
| Calls | 1:1 voice and video over WebRTC, ringing, accept/decline, mute/camera/speaker, reconnect on network drops, call history |
| Settings | Profile, privacy (last seen, read receipts, photo visibility, discoverability, blocked list), notifications and sounds, theme / wallpaper / font size, local cache, security (key fingerprint, backup, password change), starred messages, delete account |
| Notifications | In-app sounds, browser notifications, optional background Web Push |

**Not included:** Communities (the page is a placeholder), group calls, automatic multi-device sync, message editing, disappearing messages.

## Encryption, honestly

Messages use ECDH P-256 key agreement and AES-GCM, through the Web Crypto API only (`src/lib/crypto`). Each message gets a random AES key; the key is wrapped separately for every participant. The server stores ciphertext and public keys, never plaintext. Attachments are encrypted in the browser with the same message key before upload. The private key is stored in IndexedDB, wrapped with a key derived from your password (PBKDF2, 600,000 rounds) and is **never sent to the server**.

This is real encryption but a simplified scheme: **no forward secrecy or ratcheting** (Signal-style), and no audit. Things to know:

- **Search is local.** Ciphertext cannot be searched on the server, so search runs over a per-account cache of messages this device has already decrypted (Settings → Storage and data to clear it). Results are limited to what this device has seen.
- **Keys live on the device.** Clearing browser data loses the key. Use Settings → Security → Download backup. The backup is password-protected; restore it on a new device to read your history.
- **Verify contacts.** Contact info → *Verify security code* shows a 60-digit code derived from both public keys. If it matches on both devices, no one substituted a key.
- **Not encrypted:** message metadata (who, when, which chat, message type), reactions, statuses (text and photos), and profile fields. Link previews are fetched server-side (the function sees the URL, not your message) and then embedded in the encrypted message.
- **Call signalling** runs over a Realtime broadcast channel named by an unguessable call id; media is protected by WebRTC's DTLS-SRTP. It is not tied to your identity keys.
- **Presence** is broadcast to signed-in users on one channel; if you hide last seen you neither publish nor see it.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env      # then fill in your project values
npm run dev
```

`.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# optional
VITE_VAPID_PUBLIC_KEY=
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

Never put a Supabase service-role key in the front end. The anon key is meant for browsers; Row Level Security protects the data.

### Database

Apply every migration in `supabase/migrations` in order (`0001` to `0009`). They create the schema, all RLS policies, the private storage buckets (`avatars`, `chat-media`, `status-media`) with their policies, the Realtime publication, and the database functions the app calls (`chat_overview`, `get_or_create_*_chat`, `mark_chat_read`, `find_profile`, ...).

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
SUPABASE_DB_PASSWORD='your-db-password' npx supabase db push
```

Or paste each file into the SQL Editor, in order. Until they are applied the chat list reports that the database is missing updates.

Note `0004` deletes empty duplicate chats, and `0005` narrows who can read profiles (people are found by exact `@username` or email, never enumerated).

### Edge Functions

| Function | Purpose | Deploy |
| --- | --- | --- |
| `link-preview` | OpenGraph cards for links. Blocks private/internal addresses (SSRF), follows redirects manually, 5 s timeout, 512 KB cap, rate limited | `npx supabase functions deploy link-preview` |
| `delete-account` | Deletes the caller's files and auth user (cascades to everything they own) | `npx supabase functions deploy delete-account` |
| `purge-statuses` | Removes expired statuses and their photos | `npx supabase functions deploy purge-statuses --no-verify-jwt` |
| `notify-push` | Web Push for new messages and calls (generic bodies) | `npx supabase functions deploy notify-push --no-verify-jwt` |

**Status cleanup.** Expired statuses are already invisible; this reclaims storage. Schedule hourly (Dashboard → Integrations → Cron, or pg_cron with pg_net):

```sql
select cron.schedule('purge-statuses', '0 * * * *', $$
  select net.http_post(
    url := 'https://YOUR-REF.supabase.co/functions/v1/purge-statuses',
    headers := jsonb_build_object('Authorization', 'Bearer ' || 'YOUR_SERVICE_ROLE_KEY')
  );
$$);
```

**Background push (optional).**

1. `npx web-push generate-vapid-keys`
2. Set the public key as `VITE_VAPID_PUBLIC_KEY` and rebuild.
3. `npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com WEBHOOK_SECRET=<random>`
4. Dashboard → Database → Webhooks: create hooks on `INSERT` into `public.messages` and `public.calls`, calling `notify-push` with the header `x-webhook-secret: <same secret>`.
5. Users enable it in Settings → Notifications.

Push text is intentionally generic ("New message from Priya"): the server cannot read encrypted messages, and putting plaintext in a push payload would defeat the encryption.

### Calls and TURN

Voice and video are peer to peer; Supabase carries only the signalling. Public STUN servers work on most home networks. Symmetric NATs, corporate firewalls and some mobile carriers need a **TURN** relay, which Supabase does not provide: run `coturn` or use a hosted TURN service and set `VITE_TURN_*`. Without it, some calls will fail to connect.

## Testing

```bash
npm run check         # lint, unit tests, production build
npm run test:db       # migrations + RLS policy tests on a throwaway Postgres 16 (Docker)
npm run test:api      # the real client data layer against Postgres + PostgREST (Docker)
npm run test:e2e      # real Chrome driving the app (Docker + Google Chrome)
npm run test:e2e:prod # same, against the production build served with the shipped CSP
npm run test:all      # everything except the prod e2e run
```

The Docker suites use a local stack, never your real Supabase project. They cover: RLS (a non-member cannot read or write another chat), end-to-end encryption round trips including tampering and key substitution, message actions, groups, statuses, storage policies, the call state machine, real WebRTC negotiation between two Chrome pages, and the SSRF guard. Screenshots from the browser runs land in `tests/e2e/screenshots`.

What the local stack does **not** exercise: Supabase Realtime (so live updates, presence, typing and call ringing are not tested against a real server), Storage uploads, and Auth. The browser tests therefore reload and unlock to see another user's changes.

## Production build and Hostinger

```bash
npm run check
```

Upload the contents of `dist/`, including `.htaccess` and `sw.js`, to `public_html`. Do not upload `.env`, `node_modules` or `src`. `.htaccess` provides SPA routing, long-lived caching for hashed assets, compression and security headers, including a strict Content-Security-Policy. It allows `https://*.supabase.co` for API, Realtime and signed storage URLs; if you use a custom Supabase domain, change it there. Build-time `VITE_*` values are embedded in the bundle.

## Choices made where the brief asked to ask

| Question | Default used |
| --- | --- |
| Group size limit | 256 (enforced in the database) |
| Message retention | Kept until deleted; no auto-delete |
| Delete for everyone window | 1 hour (enforced in the database; content is wiped, not just flagged) |
| Attachment limit | 16 MB per file (photos are downscaled to 2048 px first); 10 minute voice notes |
| Wallpapers | Five built-in colourways; no uploads |

## Project layout

```
src/design/        colour tokens (single source for Tailwind + CSS variables)
src/components/    ui primitives (Button, Modal, Menu, Avatar, Ticks, ...) and layout
src/lib/           crypto (isolated, tested), supabase client, formatting, message cache
src/features/      auth, onboarding, chat, calls, status, settings, contacts, realtime
supabase/          migrations, policy tests, Edge Functions
tests/             integration (data layer) and e2e (browser) suites
scripts/           Docker-based test runners
```
