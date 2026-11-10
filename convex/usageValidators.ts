/**
 * Validators for the anonymous usage tables (convex/usage.ts), shared by the
 * schema and the mutations so the two cannot drift.
 *
 * Written out literal by literal: a validator cannot be built from the
 * readonly arrays in usageShape.ts without losing its types.
 * __vitest__/convex/usage.test.ts pins these to those lists.
 */

import { v } from "convex/values";

export const stepValidator = v.union(
  v.literal("first_open"),
  v.literal("consent_shown"),
  v.literal("consent_accepted"),
  v.literal("consent_declined"),
  v.literal("mic_allowed"),
  v.literal("mic_denied"),
  v.literal("first_record_tap"),
  v.literal("first_take_ok"),
  v.literal("first_take_failed"),
  v.literal("paywall_shown")
);

export const screenValidator = v.union(
  v.literal("home"),
  v.literal("days"),
  v.literal("settings"),
  v.literal("diagnostics"),
  v.literal("new_reminder"),
  v.literal("paywall"),
  v.literal("alarm"),
  v.literal("recording"),
  v.literal("composer"),
  v.literal("edit_sheet"),
  v.literal("consent"),
  v.literal("other")
);

export const tapValidator = v.union(
  v.literal("mic"),
  v.literal("typed_entry"),
  v.literal("reminder_card"),
  v.literal("mark_done"),
  v.literal("upgrade"),
  v.literal("today_tab"),
  v.literal("days_tab"),
  v.literal("settings_tab")
);

export const variantValidator = v.union(v.literal("development"), v.literal("production"));

