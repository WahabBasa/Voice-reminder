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
import type * as helpers from "../helpers.js";
import type * as reminders from "../reminders.js";
import type * as scheduleShape from "../scheduleShape.js";

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
  helpers: typeof helpers;
  reminders: typeof reminders;
  scheduleShape: typeof scheduleShape;
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
