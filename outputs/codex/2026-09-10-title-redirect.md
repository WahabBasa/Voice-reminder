**1. Factual corrections**

- The current Reminders list uses `ReminderListItem`, not `ReminderCard` ([app/index.tsx:1730](/C:/Dev/VR/app/index.tsx:1730)). `importedCardId` triggers scrolling; I found no visual highlight ([app/index.tsx:1673](/C:/Dev/VR/app/index.tsx:1673)).
- `parsePrompt.test.ts` currently tests cache ordering and spoken-rule placement, not title length. Add title-rule assertions; there are no existing 2–4-word expectations to replace ([parsePrompt.test.ts:37](/C:/Dev/VR/__tests__/convex/parsePrompt.test.ts:37)).
- `active=false` **resets Days to today and closes its month sheet after 400 ms**; it neither unmounts Days nor pauses its timer ([DaysPage.tsx:123](/C:/Dev/VR/components/days/DaysPage.tsx:123), [DaysPage.tsx:143](/C:/Dev/VR/components/days/DaysPage.tsx:143)).
- The AlarmKit presentation is generated in [withAlarmKit.js:413](/C:/Dev/VR/plugins/withAlarmKit.js:413), beyond the standalone Swift files.

**2. Answers**

- **Q1:** Both Reminders and Days use a one-line title with `flexShrink: 1`; six words can truncate precisely the distinguishing detail ([ReminderListItem.tsx:123](/C:/Dev/VR/components/ReminderListItem.tsx:123), [ReminderListItem.tsx:223](/C:/Dev/VR/components/ReminderListItem.tsx:223)). The older `ReminderCard` also limits titles to one line.
- Full-screen alarm titles have no explicit line limit ([AlarmOverlay.tsx:560](/C:/Dev/VR/components/AlarmOverlay.tsx:560), [app/alarm.tsx:420](/C:/Dev/VR/app/alarm.tsx:420)). The edit title is a single-line input with `maxLength={100}` ([EditReminderSheet.tsx:600](/C:/Dev/VR/components/EditReminderSheet.tsx:600)).
- Notifications receive the full title ([notifications.ts:2322](/C:/Dev/VR/lib/notifications.ts:2322)). AlarmKit receives it unchanged through `LocalizedStringResource`; no custom Live Activity layout or title limit was found. Native alert visibility needs a device check; source inspection cannot guarantee six words fit.
- **Q2:** No other 2–4-word dependency found. Helpers contain the separate spoken rule. Cache tests remain structurally valid; `parseUsage` records usage, not budgets. Both worker and shared fast parser use 2,000 output tokens—no reason to increase that for this change ([creationJobActions.ts:315](/C:/Dev/VR/convex/creationJobActions.ts:315), [actions.ts:1412](/C:/Dev/VR/convex/actions.ts:1412)).
- **Q3:** Typed and voice paths share the prompt and downstream behavior; keep the same title rule ([actions.ts:1380](/C:/Dev/VR/convex/actions.ts:1380)).
- **Q4:** Yes: pending takes render in the list header ([app/index.tsx:1842](/C:/Dev/VR/app/index.tsx:1842)). A is coherent, but also reveal that header—the retained list scroll position may hide it.
- **Q5:** Browsed date/week context is lost on leaving; the component remains mounted. This is existing navigation behavior.
- **Q6:** Yes: all active reminders appear, including future dates; overdue items come first, then next due time ([remindersMembership.ts:38](/C:/Dev/VR/lib/remindersMembership.ts:38)).
- **Q7:** Yes: reconciliation uses the same importer, and delayed processing can finish after the user resumes browsing or opens a sheet ([app/index.tsx:1521](/C:/Dev/VR/app/index.tsx:1521)). “Started this session” alone is insufficient for B: the user can move on within that session. Prefer A without a second automatic switch on import.

**3. Real edge cases**

Fix 1:
- **Preserve the action:** “Water bottle from the fridge” still omits what to do. Prefer “Take bottle out of fridge”; distinguish taking out from putting in.
- **Exclude scheduling text, not meaningful temporal qualifiers:** retain “July electricity bill” or “Call about Friday’s flight.”
- **Treat 3–6 words as a target:** avoid padding “Call mom” or natural short Arabic titles, and avoid dropping essential details to meet six.
- **Small screens/large text/Arabic:** one-line rows can defeat the fix. Allow two title lines in the shared row and check representative English/Arabic examples.

Fix 2:
- **Previously scrolled list:** switch and reveal the pending header, otherwise A can still hide the take.
- **Failed save or cancelled recording:** navigate only after successful pending-take persistence, beside overlay dismissal ([app/index.tsx:1284](/C:/Dev/VR/app/index.tsx:1284)).
- **Slow processing, another recording, or relaunch:** landing must not pull the user back after they deliberately leave.
- **Future reminder or multiple reminders:** pending header first, then existing scroll-to-first-created behavior is sensible; zero-created imports must retain their existing gate feedback.

**4. Verdict**

**Fix 1: approve with action preservation, a soft word target, and two-line rows. Fix 2: choose A after persistence, reveal the pending header, and leave import-time navigation alone.** Read-only inspection completed; no files modified and no Convex/EAS commands run.