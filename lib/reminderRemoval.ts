import { useReminderStore } from "./store";
import { deleteReminderWithAudio } from "./notifications";

export async function removeReminderFully(
  reminderId: string,
  opts?: { removeConvexById?: (convexId: string) => Promise<void> }
): Promise<void> {
  const store = useReminderStore.getState();
  const reminder = store.getReminderById(reminderId);

  // Always try to remove locally first so UI updates immediately.
  await store.deleteReminder(reminderId).catch((e) => {
    console.log("[VR] removeReminderFully: store.deleteReminder failed:", e);
  });

  // Cancel triggers + delete local audio.
  await deleteReminderWithAudio(reminderId).catch((e) => {
    console.log("[VR] removeReminderFully: deleteReminderWithAudio failed:", e);
  });

  // Best-effort Convex cleanup.
  const convexId = reminder?.convexId;
  if (convexId && opts?.removeConvexById) {
    await opts.removeConvexById(String(convexId)).catch((e) => {
      console.log("[VR] removeReminderFully: removeConvex failed:", e);
    });
  }
}
