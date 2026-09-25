# WhatsApp Web Clone

A React, Vite, TypeScript and Supabase foundation for a private realtime messaging app.

## Local setup

1. Install Node.js 20 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the Supabase URL and anon key into `.env`:

   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

Never put a Supabase service-role key in this app. The anon key is intended for browser use; Supabase Row Level Security must protect all data.

## Database setup

Phase 2 is defined in [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql). With the Supabase CLI linked to your project, apply it with:

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

For local development, start Supabase first with `npx supabase start`, then validate with `npx supabase db lint --local`. The optional [supabase/seed.sql](supabase/seed.sql) links the first two local Auth users into a sample chat.

## Encryption

The Phase 4 crypto module is isolated in [src/lib/crypto](src/lib/crypto). It uses P-256 ECDH, AES-GCM, PBKDF2, and IndexedDB. Login initializes a device identity; the private JWK is password-wrapped locally and the profile stores only the public JWK. This is a simplified E2E design and does not provide Signal-style ratcheting or forward secrecy yet.

## Production build

Vite injects `VITE_*` values at build time. Set the production values in `.env` on the machine doing the build, then run:

```bash
npm run lint
npm run build
```

The deployable output is `dist/`. Upload the contents of `dist/`, including `.htaccess`, into Hostinger's `public_html` directory. Do not upload `.env`, `node_modules`, or the source directory.

The included `public/.htaccess` provides SPA history fallback, long-lived caching for hashed assets, compression where Apache supports it, and browser security headers compatible with camera, microphone, Supabase, and WebRTC usage.

## Hostinger deployment

The recommended deployment is to build locally or in CI and upload `dist/` through Hostinger File Manager, FTP, or a deployment workflow. For a Hostinger Node.js app, use the same commands with `npm run build`, serve `dist` as the static document root, and configure the app's environment variables before building. Because this is a Vite SPA, the final web server must return `index.html` for unknown application routes.
