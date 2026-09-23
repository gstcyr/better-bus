# MyBusStop — new client

A modern React Native (Expo SDK 57) rewrite of the `ca.southland.stlgps` bus-tracking
app, talking to the existing STLGPS web service at `ws.pwt.ca`. Runs on **iOS and
Android** from one codebase, in **English and French**.

The reverse-engineered wire protocol is documented in [`../PROTOCOL.md`](../PROTOCOL.md).

## What's here

| Screen | File | Purpose |
|---|---|---|
| Login | `src/screens/LoginScreen.tsx` | `authenticateUser`, remember-me, auto-login, EN/FR toggle |
| Map | `src/screens/MapScreen.tsx` | Live map: stops, bus position, delay, progress, my-stop highlight. AM/PM route auto-select. Auto-refresh gated to service hours. |
| Route picker | `src/screens/RoutePickerScreen.tsx` | Switch between the user's routes |
| Stops | `src/screens/StopsScreen.tsx` | Full stop list, schedule vs. actual times |
| Stop detail | `src/screens/StopDetailScreen.tsx` | Set "my stop" (`putMyStop2`) |
| Notifications | `src/screens/NotificationSettingsScreen.tsx` | Alert thresholds, skip today, sleep N days, language |

Core pieces:

- `src/api/client.ts` — typed wrapper over the 8 endpoints; `/Date(...)/` parsing, the
  `"true"`/`true` flag quirk, timeouts, and **no-cache** reads (the service sends a 4h
  `Cache-Control` that would otherwise serve stale data).
- `src/state/AuthContext.tsx` — session, remembered credentials, auto-login.
- `src/i18n/` — English/French strings, device-locale default, persisted toggle.
- `src/notifications/` — local ETA-based alerts (advance + arriving-soon), scheduled from
  the server's `stop_arrival_time`; skip-today and sleep controls.
- `src/hooks/useIntervalPoll.ts` — polling with a live countdown, background pause.

## Run locally (development)

```bash
cd mybusstop
npm install
```

Maps and notifications use native code, so **Expo Go can't fully run them** — use a dev
build:

```bash
npx expo run:android      # needs the Android SDK + a JDK (see android-env.sh)
npx expo run:ios          # needs macOS + Xcode
```

`source ./android-env.sh` first on this machine to set `JAVA_HOME` / `ANDROID_HOME`.
iOS uses **Apple Maps** (no key needed). The Android Google Maps key is wired via the
`react-native-maps` plugin prop in `app.json` — swap in your own key + your release
signing SHA-1 before shipping.

## Cloud builds — EAS (no Mac needed for iOS)

Native folders are gitignored; EAS regenerates them from `app.json` + config plugins, so
one command builds either platform. Profiles are in `eas.json`.

One-time setup (needs **your** accounts — I can't log in for you):

```bash
npm i -g eas-cli          # or use npx eas-cli
eas login                 # your Expo account
eas init                  # writes extra.eas.projectId into app.json
```

Then build:

```bash
# Installable internal builds (APK for Android, ad-hoc/TestFlight for iOS)
eas build --profile preview --platform android
eas build --profile preview --platform ios      # prompts to log into your Apple account

# Store builds
eas build --profile production --platform all
eas submit --platform ios        # uploads to App Store Connect / TestFlight
```

### iOS specifics

- **Apple Developer Program ($99/yr)** is required to install on a device or use
  TestFlight/App Store. EAS auto-manages the signing certificate + provisioning profile
  when you log in with your Apple ID during `eas build`.
- No Apple Push (APNs) needed — the app uses **local** notifications only.
- **Bundle identifier** is `ca.gstcyr.stlgps` (set in `app.json` as both
  `ios.bundleIdentifier` and `android.package`). If the reused Google Maps key turns out
  to be package-restricted, either authorize this package on the key or supply your own.
- Commit your changes before `eas build` (it archives from git).

## Notes / follow-ups

- **FCM push** — server-initiated announcements. `registerDeviceToken()` (`putSP2`) is
  ready, but receiving the operator's pushes needs their Firebase project config files.
- **Backend used as-is.** No proxy. To hide credentials / fix `/Date()` server-side, put
  a thin proxy in front and repoint `READ_BASE`/`WRITE_BASE` in `src/api/client.ts`.
- **Boot-restart** for notifications after a phone reboot, and **holiday/weekday calendar
  awareness** for alerts, are possible enhancements.
