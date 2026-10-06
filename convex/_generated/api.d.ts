/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as creationJobActions from "../creationJobActions.js";
import type * as creationJobs from "../creationJobs.js";
import type * as creationValidate from "../creationValidate.js";
import type * as crons from "../crons.js";
import type * as devices from "../devices.js";
import type * as feedback from "../feedback.js";
import type * as feedbackEmail from "../feedbackEmail.js";
import type * as founderAlerts from "../founderAlerts.js";
import type * as founderAlertsEmail from "../founderAlertsEmail.js";
import type * as helpers from "../helpers.js";
import type * as languages from "../languages.js";
import type * as parseUsage from "../parseUsage.js";
import type * as reminders from "../reminders.js";
import type * as scheduleShape from "../scheduleShape.js";
import type * as stt from "../stt.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  creationJobActions: typeof creationJobActions;
  creationJobs: typeof creationJobs;
  creationValidate: typeof creationValidate;
  crons: typeof crons;
  devices: typeof devices;
  feedback: typeof feedback;
  feedbackEmail: typeof feedbackEmail;
  founderAlerts: typeof founderAlerts;
  founderAlertsEmail: typeof founderAlertsEmail;
  helpers: typeof helpers;
  languages: typeof languages;
  parseUsage: typeof parseUsage;
  reminders: typeof reminders;
  scheduleShape: typeof scheduleShape;
  stt: typeof stt;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
