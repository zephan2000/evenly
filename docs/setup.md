# Local setup

## Prerequisites

- Node 20+ (we use 24 in dev)
- npm 10+
- Expo Go app on your phone (for fastest dev loop) OR iOS Simulator / Android Emulator
- A Supabase account, a Clerk account, a Google AI Studio account

## 1. Clone and install

```bash
git clone https://github.com/zephan2000/evenly.git
cd evenly
npm install
```

## 2. Environment variables

Copy and fill:

```bash
cp .env.example .env.local
```

### Supabase

1. Create a project at https://supabase.com/dashboard.
2. Project Settings → API → copy URL and `anon` key into `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Copy `service_role` key into `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose).
4. Run migrations: `npm run db:migrate` (sets up the schema in `supabase/migrations/`).

### Clerk

1. Create an application at https://dashboard.clerk.com.
2. API Keys → copy publishable key and secret key.
3. Configure JWT template for Supabase:
   - JWT Templates → New template → Supabase
   - Name it `supabase`
   - Set the signing algorithm to HS256 with Supabase's JWT secret (Supabase Project Settings → API → JWT Settings → JWT Secret)
4. Set `CLERK_JWT_TEMPLATE_NAME=supabase` in `.env.local`.

### Gemini

1. Visit https://aistudio.google.com/app/apikey.
2. Create API key, copy into `GEMINI_API_KEY`.
3. Free tier: 1500 requests/day on `gemini-2.0-flash`.

### OpenRouter (optional fallback)

1. Visit https://openrouter.ai/keys.
2. Create key, copy into `OPENROUTER_API_KEY`.
3. Used only when Gemini fails. Skip if you don't want a fallback.

## 3. Run

```bash
npm run start          # interactive dev menu
npm run web            # web at http://localhost:8081
npm run ios            # iOS Simulator
npm run android        # Android Emulator
```

## 4. Verify

- Open Expo Go and scan the QR code.
- The home screen should load without errors.
- Try the receipt scan flow with a sample receipt — should round-trip through Gemini and return structured data.

## Troubleshooting

- **"Network request failed" in mobile:** check that `EXPO_PUBLIC_*` env vars are set; they're inlined at build time.
- **Clerk auth not working:** verify the JWT template name matches `CLERK_JWT_TEMPLATE_NAME`.
- **Supabase RLS denying everything:** make sure you're passing the Clerk JWT in `Authorization: Bearer <token>` header.
- **Gemini 429:** you've hit the daily limit. Set up `OPENROUTER_API_KEY` for fallback.

## Deploy

- **Web (Vercel):** push to `main`. Vercel auto-detects Expo Router static export.
- **Mobile:** EAS Build (`eas build --platform ios|android`). Configure in `eas.json` (not yet present; add when needed).
