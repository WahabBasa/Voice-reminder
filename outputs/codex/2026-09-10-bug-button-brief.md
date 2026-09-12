Short pass (not deep) on a UI idea. Context: the feedback feature from outputs/codex/2026-09-10-feedback-simple-brief.md is now shipped and working (composer sheet, outbox, status list, founder email). Read-only; no file changes; no convex/eas. Answer in under 40 lines: (1) corrections with file:line; (2) answers to Q1-Q4; (3) verdict with a concrete recommendation. Explore the repo for the current layout: bottom bar `components/BottomBar.tsx` (three tabs + a big blue mic button, floating pill at the bottom), page headers in `app/index.tsx` (Reminders has a "+" top-right), `components/days/DaysPage.tsx` (header has a month chip top-right), `app/settings.tsx`. Feedback opener store `lib/feedbackUi.ts`, composer `components/FeedbackSheet.tsx`, host `components/FeedbackHost.tsx` mounted in `app/_layout.tsx`.

## The user's idea (quoting intent)
"Sneak a bug icon that is always on all three pages such that the user can easily send an issue. From time to time a prompt would float above it like 'report bugs' or 'need help?' to clue the user in that this is where you send issues. Intent: ease and convenience, making it much more likely users share feedback on any issue."

## Claude's take (to be grilled)
- A permanently floating button competes with the mic, which is the app's one primary action, and the bottom pill already carries three tabs. A second floating element on every page is visual noise in an otherwise minimal UI.
- Counter-proposal A: a small, consistent icon in each page header (top-right on Settings and Days, next to the existing "+" on Reminders, same size/weight as those chips) — always present, one tap to the composer, no float.
- Counter-proposal B: keep the floating element but fold it INTO the bottom pill as a fourth small item rather than a separate blob.
- Nudge: not "from time to time" on a timer (that trains users to ignore it and reads as nagging). Trigger-based instead: (1) after a take fails, (2) after the user edits the title or spoken line of a reminder created in the last 2 minutes (a parse-miss signal), (3) once, on the 3rd day of use. A small tooltip bubble anchored to the icon ("Something off? Tell me here"), auto-dismiss 6 s, tap to open the composer, never while recording or while a sheet is open, at most once per week, stored locally.

## Questions
- Q1: Which placement do you pick and why — floating blob, header icon (A), or bottom-pill item (B)? Consider thumb reach on an iPhone 12, the mic's dominance, and that the composer already opens from the failed card and the edit sheet.
- Q2: The nudge triggers above — keep, cut, or change? Any trigger that will fire at the wrong moment for a normal user?
- Q3: Any iOS HIG / App Review concern with a persistent "report a bug" affordance or a tooltip (none expected — confirm)?
- Q4: Copy: one label for the icon's accessibility name and one line for the tooltip, plain and non-provider-specific.
