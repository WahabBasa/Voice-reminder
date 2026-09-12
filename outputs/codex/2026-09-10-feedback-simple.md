**(1) Corrections**

- [EditReminderSheet.tsx:767](C:/Dev/VR/components/EditReminderSheet.tsx:767): the save button currently says **Done**; the bottom area contains Trash/Done, with no ⋯ menu.
- [EditReminderSheet.tsx:134](C:/Dev/VR/components/EditReminderSheet.tsx:134): the store row is the **saved** reminder; visible unsaved inputs are separate state. Say “Includes saved reminder details. Your edits stay here.” Keep the edit sheet mounted beneath the composer.
- [Simplified brief:5](C:/Dev/VR/outputs/codex/2026-09-10-feedback-simple-brief.md:5): use “Saved on this phone. Sends when Remi is open and online.” Include queued items in “Your feedback” as **Waiting to send**, so an offline submission does not disappear.
- [Simplified brief:4](C:/Dev/VR/outputs/codex/2026-09-10-feedback-simple-brief.md:4): `onboarding@resend.dev` works only when the recipient is your Resend account email; otherwise use a verified domain. Env variables being set does not establish this. [Resend restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
- [privacy.html:69](C:/Dev/VR/legal-site/privacy.html:69): deleting a reminder will now leave copies in feedback and founder email. Explain that exception and its retention.

**(2) Q1–Q4**

- **Q1:** Keep read state local; no server `seenByUserAt` needed. But submission is not attention: give records an optional server timestamp such as `respondedAt`, set only when the founder changes status/note. Compare that against a local watermark. `updatedAt` works only with equally explicit exclusion of initial receipt and bookkeeping changes.
- Advance the watermark to the greatest **server response timestamp actually displayed**, after the list loads—not phone `Date.now()` or the banner tap. That avoids clock skew and marking unseen responses read. “Received” means stored; “Looking into it” or a founder note means attended to.
- **Q2:** Keep the root subscription for this tiny app and 50-row bound. A durable `hasFeedback` flag adds another state that can become inconsistent for little benefit. Wait for device identity before subscribing; Convex supports `"skip"` for that. [Convex React](https://docs.convex.dev/client/react/overview).
- **Q3:** A quiet, labeled row below the schedule/settings fields and above the Trash/Done footer. Use “Report a problem,” a neutral icon, and its own spacing. Returning from Send or Cancel should reveal the unchanged draft.
- **Q4:** Yes: disclose **Customer Support**, review **Other User Content** for attached reminder content, **Device ID**, and **Other Diagnostic Data**, with App Functionality/support purposes and device-linked treatment. No new Email Address category solely because the founder receives an email. This anonymous form should not assume Apple’s optional-feedback exemption; its conditions include displaying a name/account name. Actual submitted labels were not inspected. [Apple privacy details](https://developer.apple.com/app-store/app-privacy-details/).
- Update [privacy.html:21](C:/Dev/VR/legal-site/privacy.html:21), [53](C:/Dev/VR/legal-site/privacy.html:53), and [66](C:/Dev/VR/legal-site/privacy.html:66) for feedback content/context, support use, Resend/mailbox handling, retention and deletion. Show a short attachment notice for failed takes too. The described support use does not introduce ATT tracking. [Apple definitions](https://developer.apple.com/app-store/app-privacy-details/).

**(3) Three normal-user edge cases**

1. **Offline or interrupted send:** preserve the draft if persistence fails; serialize outbox writes/flushes and reuse the same UUID after lost acknowledgement. A duplicate submission must not schedule another email.
2. **Email fails:** the report can say Received while the founder never gets alerted. No retries is acceptable only with a routine dashboard inbox check; scheduled actions are not automatically retried. [Convex scheduling](https://docs.convex.dev/scheduling/scheduled-functions).
3. **“Fixed” requires a newer app:** include “Fixed in version X—please update” in the note, rather than implying the installed version now works.

**(4) Verdict:** Proceed with this scope, including in-app status—it now directly serves the stated goal. Fix the attention signal, queued-list visibility, draft preservation and privacy wording before shipping. Read-only; no files changed or Convex/EAS commands run.