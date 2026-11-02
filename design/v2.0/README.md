# OSF v2.0 — approved UI reference

- `screens/` — one file per screen (website + mobile app). Open in a browser as reference; they use a small template syntax ({{value}}, <sc-for>, <sc-if>, <dc-import>) and inline styles. Rebuild in React with real data — do not ship these files.
- `assets/` — dos_logo.png, Open_Source_Fridays_logo.png, dos_mark.png (round mark for app icon / splash).
- `canvas.json` — layout index (titles, sizes; iOS 390x844, Android 412x915).
- Website: Main, Episodes, Speakers, Who, Speak, Register-1/2/3, Policies, Nav, Footer.
- App: App-iOS-1..17 (+15b), App-And-* (Android wrappers reuse the iOS component with platform="android"), App-TabBar.
See CLAUDE_CODE_BRIEF_OSF_v2.0.md §3 for tokens and route mapping.
