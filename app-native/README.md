# Lumenati — The App (Expo universal)

The mobile-native client (iOS, Android, web) from one Expo Router codebase. See
`../POS-STARTER-6-THE-APP.md` for the plan. It reuses the SAME Supabase backend
as the web admin — reads are RLS-scoped, so an artist only sees their own data.

This is sub-session **6a**: scaffold + auth + role-routed shell + one real screen.

## Run it

```bash
cd app-native
cp .env.example .env      # fill EXPO_PUBLIC_SUPABASE_URL + _ANON_KEY (same as web)
npm install
npx expo start           # press i / a / w for iOS sim / Android / web
```

Sign-in is email one-time-code (no passwords, no deep links). For the code to
arrive, the Supabase Auth email template must include `{{ .Token }}`. Only
existing staff can sign in (`shouldCreateUser: false`).

## Layout

```
app/
  _layout.tsx        providers + header-less stack (AuthProvider)
  index.tsx          redirect: /home if signed in, else /sign-in
  sign-in.tsx        email OTP
  (app)/_layout.tsx  auth guard
  (app)/home.tsx     role-routed home (owner stats vs artist money), real data
lib/
  supabase.ts        shared client (AsyncStorage; localStorage on web)
  auth.tsx           session + role from `profiles`
  theme.ts           brand tokens + money()
```

## Next (6b+)

Money & realized hourly rate & goals & tax tracker (6b), Tap to Pay + instant
payouts (6c), reminders + owner-on-the-go + snap-to-count (6d). Tap to Pay needs
a dev build (not Expo Go) and Apple/Google merchant enrollment.
