1) In `C:\Dev\VR`, align Expo SDK deps:
- `npx.cmd expo-doctor`
- `npx.cmd expo install --fix`

2) Clean/reinstall JS deps (recommended after `--fix`):
- `rd /s /q node_modules`
- `del package-lock.json`
- `npm ci`

3) Wipe the installed app on the Android device/emulator:
- Uninstall `com.wahabbasa.VoiceReminder` from the device
  - (or) `adb uninstall com.wahabbasa.VoiceReminder`

4) Rebuild + install a fresh dev client (native must match JS/plugins/new-arch):
- `npm run android`

5) Start Metro the correct way for dev client + clear cache:
- `npx.cmd expo start --dev-client --clear --host localhost`

6) If using USB, tunnel Metro:
- `adb reverse tcp:8081 tcp:8081`

7) Repro + collect logs if it still crashes:
- Start logcat:
  - `adb logcat -c`
  - `adb logcat | rg -n \"PlatformConstants|EarlyJsError|HeadlessJsTaskService|libappmodules|Bridgeless|ReactHost|ReactInstance\"`
- Then launch the app and capture the first crash block + any `dlopen`/`libappmodules` lines.

8) If it still happens after a fresh rebuild, do an A/B test to isolate New Architecture:
- Set `expo.newArchEnabled` to `false` in `app.json`
- Set `newArchEnabled=false` in `android/gradle.properties`
- Repeat steps 3–7 (uninstall, `npm run android`, start Metro with `--dev-client`).