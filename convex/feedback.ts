// Founder: Dashboard → Functions → feedback:setStatus → run with {id, status, note}.
// If a fix needs a newer app, write the note as 'Fixed in version X — please update'.

/**
 * In-app user feedback (schema: `feedback`).
 *
 * The client files a report through `submit`, idempotent on (deviceId, clientId)
 * so a lost response never files a duplicate or sends a second email. The
 * founder reads reports on the Convex dashboard and sets a status through the
 * internal `setStatus` — a client can only ever read its own device's rows back
 * through `listForDevice`, and never the raw `context` or `deviceId`.
 *
 * Trust model matches creationJobs: `deviceId` is a bearer id, and every public
 * entry point is scoped to it. There is no `"use node"` here — the notify action
 * needs only `fetch`, which the default Convex runtime provides — so the reads,
 * writes and the action all live in this one file.
 */

import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { buildFeedbackEmail } from "./feedbackEmail";

/** Text bounds after trimming, and the serialized-context cap (spec). */
const MAX_TEXT_LENGTH = 2000;
const MAX_CONTEXT_BYTES = 8 * 1024;

const statusValidator = v.union(
  v.literal("received"),
  v.literal("looking"),
  v.literal("fixed")
);

/** The client-facing projection: no `context`, no `deviceId`. */
const listItemValidator = v.object({
  id: v.id("feedback"),
  clientId: v.string(),
  text: v.string(),
  createdAt: v.number(),
  status: statusValidator,
  note: v.optional(v.string()),
  respondedAt: v.optional(v.number()),
  updatedAt: v.number(),
});

// ─── submit ──────────────────────────────────────────────────────────────────

/**
 * File a report. Idempotent on (deviceId, clientId): a second call with the same
 * pair returns the existing row with `duplicate: true`, changes nothing, and does
 * NOT re-notify — the client retries this from every reconciliation pass, and a
 * lost response must not cost a duplicate report or a second founder email.
 *
 * Only a fresh insert validates and schedules the notification; the idempotent
 * path short-circuits before either.
 */
export const submit = mutation({
  args: {
    deviceId: v.string(),
    clientId: v.string(),
    text: v.string(),
    createdAt: v.number(),
    context: v.optional(v.any()),
  },
  returns: v.object({ id: v.id("feedback"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_client", (q) =>
        q.eq("deviceId", args.deviceId).eq("clientId", args.clientId)
      )
      // `first`, not `unique`: a duplicate could only exist through a bug, and a
      // throwing read would strand the client forever.
      .first();
    if (existing) {
      return { id: existing._id, duplicate: true };
    }

    const text = args.text.trim();
    if (text.length === 0) {
      throw new Error("feedback.submit: text must not be empty");
    }
    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error(
        `feedback.submit: text must be at most ${MAX_TEXT_LENGTH} characters (got ${text.length})`
      );
    }

    if (args.context !== undefined) {
      const bytes = new TextEncoder().encode(JSON.stringify(args.context)).length;
      if (bytes > MAX_CONTEXT_BYTES) {
        throw new Error(
          `feedback.submit: context is too large (${bytes} bytes, max ${MAX_CONTEXT_BYTES})`
        );
      }
    }

    const now = Date.now();
    const id = await ctx.db.insert("feedback", {
      clientId: args.clientId,
      deviceId: args.deviceId,
      text,
      createdAt: args.createdAt,
      receivedAt: now,
      context: args.context,
      status: "received" as const,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.feedback.notify, { id });

    return { id, duplicate: false };
  },
});

// ─── listForDevice ───────────────────────────────────────────────────────────

/**
 * The device's own reports, newest first, capped at 50. Projected for the
 * client: never the raw `context`, never the `deviceId`.
 */
export const listForDevice = query({
  args: { deviceId: v.string() },
  returns: v.array(listItemValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      id: row._id,
      clientId: row.clientId,
      text: row.text,
      createdAt: row.createdAt,
      status: row.status,
      note: row.note,
      respondedAt: row.respondedAt,
      updatedAt: row.updatedAt,
    }));
  },
});

// ─── setStatus (founder-only) ────────────────────────────────────────────────

/**
 * The founder sets a report's status and optional reply from the dashboard.
 * `note` omitted leaves the existing note untouched; `note: ""` clears it.
 * Stamps `respondedAt` and `updatedAt` — this is the ONLY place `respondedAt`
 * is ever written.
 */
export const setStatus = internalMutation({
  args: {
    id: v.id("feedback"),
    status: statusValidator,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch: {
      status: "received" | "looking" | "fixed";
      respondedAt: number;
      updatedAt: number;
      note?: string | undefined;
    } = {
      status: args.status,
      respondedAt: now,
      updatedAt: now,
    };
    if (args.note !== undefined) {
      // Empty string clears the note (patch sets the column to undefined).
      patch.note = args.note === "" ? undefined : args.note;
    }
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

// ─── notify ──────────────────────────────────────────────────────────────────

/**
 * The row `notify` needs. Deliberately narrower than the document — no
 * `deviceId`, which must never reach the email.
 */
export const getForNotify = internalQuery({
  args: { id: v.id("feedback") },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("feedback"),
      text: v.string(),
      context: v.optional(v.any()),
    })
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    return { id: row._id, text: row.text, context: row.context };
  },
});

/**
 * Email the founder about one report (best-effort). Missing env is a no-op; a
 * non-2xx or a network error is logged once and dropped — no retries, because
 * the founder also watches the dashboard. Never blocks `submit`: it runs as a
 * scheduled action.
 */
export const notify = internalAction({
  args: { id: v.id("feedback") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.FEEDBACK_EMAIL_TO;
    if (!apiKey || !to) {
      console.warn("[VR] feedback.notify: RESEND_API_KEY / FEEDBACK_EMAIL_TO not set; skipping email");
      return null;
    }

    const row = await ctx.runQuery(internal.feedback.getForNotify, { id: args.id });
    if (!row) return null;

    const { subject, body } = buildFeedbackEmail({
      id: row.id,
      text: row.text,
      context: row.context,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Remi Feedback <onboarding@resend.dev>",
          to: [to],
          subject,
          text: body,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(`[VR] feedback.notify: Resend responded ${res.status}`);
      }
    } catch (e) {
      console.error("[VR] feedback.notify: email send failed:", e);
    } finally {
      clearTimeout(timer);
    }
    return null;
  },
});
