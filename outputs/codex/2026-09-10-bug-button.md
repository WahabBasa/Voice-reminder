**Corrections**
- A isn’t a drop-in: Reminders has **Get Pro plus “+”** ([app/index.tsx:1818](/C:/Dev/VR/app/index.tsx:1818)); Days already occupies top-right with its month picker ([DaysPage.tsx:248](/C:/Dev/VR/components/days/DaysPage.tsx:248)). Both need deliberate spacing.
- Settings’ header sits **inside its ScrollView**, so a header icon would scroll away ([app/settings.tsx:242](/C:/Dev/VR/app/settings.tsx:242)). Pin it to meet “always available.”
- Match visual weight, not existing target size: “+” is only 36×36 ([app/index.tsx:2037](/C:/Dev/VR/app/index.tsx:2037)); give feedback a 44×44-point target.
- B mixes a composer action into actual navigation tabs (`accessibilityRole="tab"`), while the mic is already separate ([BottomBar.tsx:38](/C:/Dev/VR/components/BottomBar.tsx:38), [BottomBar.tsx:52](/C:/Dev/VR/components/BottomBar.tsx:52)).
- “Never while a sheet is open” needs broader gating: the feedback store tracks only its composer/list ([feedbackUi.ts:22](/C:/Dev/VR/lib/feedbackUi.ts:22)); recording/editing visibility lives elsewhere ([app/index.tsx:1917](/C:/Dev/VR/app/index.tsx:1917)).

**Q1 — Pick A, with qualifications.**
Header placement costs thumb reach on an iPhone 12; the bottom options win there. But feedback already has contextual access in the failed card and edit sheet ([PendingTakeCard.tsx:161](/C:/Dev/VR/components/PendingTakeCard.tsx:161), [EditReminderSheet.tsx:785](/C:/Dev/VR/components/EditReminderSheet.tsx:785)). A supplies general discovery while preserving the mic’s dominance.
Use the same trailing header position across all three pages, with existing controls immediately left; pin Settings’ header. Prefer a quiet speech-bubble icon: “bug” assumes users understand the problem technically. Claude’s “visual noise” is a design judgment, not proof that floating feedback cannot work.

**Q2 — Cut two triggers; simplify the third.**
- **Failure: cut the extra tooltip.** The failed card already offers reporting; let users retry without another competing prompt.
- **Edit within two minutes: cut.** Renaming, polishing wording, or changing one’s mind is normal. This is weak evidence of a parse miss and prompts precisely while users are correcting something.
- **Third day: change to one discovery tip on the third distinct usage day**, at the next idle, unobstructed page view. Skip permanently if feedback was already opened; store “tip shown” locally. No weekly recurrence.
- Suppress during recording, processing, keyboard entry, sheets, and other banners. Drop the rigid six-second dismissal; offer explicit dismissal without blocking the page.

**Q3 — No inherent App Review concern; two HIG qualifications.**
My reading: persistent reporting and a modest tip are acceptable; Apple explicitly expects accessible contact/support information ([Review §1.5](https://developer.apple.com/app-store/review/guidelines/#safety)).
B conflicts with guidance that tabs navigate rather than perform actions ([Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)). Six-second tips raise accessibility concerns; Apple prefers explicit dismissal for timed UI. Use adequately sized targets ([Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Touch targets](https://developer.apple.com/design/tips/)). These are design considerations, not automatic rejection grounds.

**Q4 — Copy**
Accessibility name: **“Send feedback”**  
Tooltip: **“Something wrong? Send feedback here.”**  
Avoid “Need help?” unless the composer actually provides help; it currently collects a message.

**Verdict:** Ship **A with a pinned Settings header, consistent 44×44 targets, and one discovery tip**. Reuse `feedbackUi.openComposer`; keep the existing contextual entries. This is a small, coherent addition without speculative error detection.