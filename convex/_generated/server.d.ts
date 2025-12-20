/* eslint-disable */
/**
 * Generated server types.
 * 
 * THIS IS A STUB FILE - Run `npx convex dev` to generate the real version.
 */

import type { GenericMutationCtx, GenericQueryCtx, FunctionReference } from "convex/server";
import type { DataModel, Id, Doc } from "./dataModel";

// Re-export types
export type { Id, Doc };

// Query context
export type QueryCtx = GenericQueryCtx<DataModel>;

// Mutation context
export type MutationCtx = GenericMutationCtx<DataModel>;

// Re-export from convex/server
export { 
  query, 
  mutation, 
  internalQuery, 
  internalMutation,
  action,
  internalAction,
  httpAction,
} from "convex/server";

