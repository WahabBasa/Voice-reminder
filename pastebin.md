Confirm intended semantics

Treat “active reminder” as: “a reminder that can still fire in the future.”
For frequency="once": after the user dismisses/marks done, it should become inactive and free a slot.
For recurring reminders: dismissing an occurrence should NOT remove the reminder (it’s still active).
Stop hiding “active” state behind history

Extract a shared helper isReminderActive(reminder, history, now) (or similar) that returns whether a reminder should count as active.
Use that helper for both:
Home list rendering (what “All” shows)
Gating count (what blocks creation)
This removes the current mismatch: “All empty” vs “active count is 5”.
Make one-time reminders actually become inactive

When an alarm is dismissed for a one-time reminder:
Delete or archive the reminder record (recommended: delete from useReminderStore.reminders + storage, and remove Convex reminder/audio + local audio file + cancel triggers).
When a reminder is marked done from the list (not via alarm screen):
Apply the same rule: if it’s frequency="once", delete/archive it instead of only writing history.
Files to touch (agent handoff):

alarm.tsx: after recording completion, if reminder is once, call the unified “remove reminder fully” path.
index.tsx: handleMarkDone / bulk done path should also remove once reminders.
Centralize deletion into one function used by both (avoid duplicating “delete store + delete audio + remove Convex”).
Add a startup cleanup for existing “ghost actives”

On app start (after reminders + history loaded), scan for frequency="once" reminders that already have a “completed/dismissed” history entry for their occurrence and are past-due, then delete/archive them.
This fixes users who already accumulated hidden reminders.
Likely place:

_layout.tsx startup task or a store action like cleanupExpiredOnceReminders().
Update Completed tab behavior

After deleting once reminders, Completed entries won’t have a backing reminder to open/edit.
Decide behavior:
Press does nothing + toast (“This one-time reminder was completed and removed”), or
Open a read-only “history detail” view.
Validation checklist

Create 5 one-time reminders → 6th blocked.
Let them fire and dismiss → active list drops (slots free) → can create again.
Mark a one-time reminder done from list → it is removed and frees a slot.
Recurring reminder dismissed → stays active and still counts.
After restart, “All” and gating agree (no more “All empty but upgrade required”).
