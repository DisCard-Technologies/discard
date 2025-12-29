/**
 * Plan Types for Brain Orchestrator
 *
 * Types for multi-step execution plans.
 * The Brain decomposes complex requests into
 * executable step sequences.
 */

import type { ParsedIntent, SoulVerificationResponse } from "./intent.js";

/**
 * Multi-step execution plan
 */
export interface ExecutionPlan {
  planId: string;
  sessionId: string;
  userId: string;
  originalIntent: ParsedIntent;
  steps: PlanStep[];
  status: PlanStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  totalSteps: number;
  completedSteps: number;
  requiresApproval: boolean;
}

/**
 * Status of an execution plan
 */
export type PlanStatus =
  | "pending"
  | "awaiting_approval"
  | "executing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Individual step in an execution plan
 */
export interface PlanStep {
  stepId: string;
  planId: string;
  sequence: number;
  action: StepAction;
  description: string;
  parameters: Record<string, unknown>;
  dependsOn: string[];
  requiresSoulVerification: boolean;
  status: StepStatus;
  result?: StepResult;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
}

/**
 * Actions a step can perform
 */
export type StepAction =
  | "parse_intent"
  | "verify_with_soul"
  | "check_balance"
  | "execute_transfer"
  | "execute_swap"
  | "fund_card"
  | "create_card"
  | "freeze_card"
  | "notify_user"
  | "request_approval"
  | "wait_for_confirmation"
  | "rollback";

/**
 * Status of a plan step
 */
export type StepStatus =
  | "pending"
  | "blocked"
  | "executing"
  | "awaiting_approval"
  | "verified_by_soul"
  | "completed"
  | "failed"
  | "skipped"
  | "rolled_back";

/**
 * Result of executing a step
 */
export interface StepResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: StepError;
  soulVerification?: SoulVerificationResponse;
  attestationQuote?: string;
  durationMs: number;
}

/**
 * Error that occurred during step execution
 */
export interface StepError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}

/**
 * Event emitted during plan execution
 */
export interface PlanExecutionEvent {
  eventId: string;
  planId: string;
  stepId?: string;
  eventType: PlanEventType;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Types of events during plan execution
 */
export type PlanEventType =
  | "plan_started"
  | "step_started"
  | "step_awaiting_approval"
  | "step_verified"
  | "step_completed"
  | "step_failed"
  | "step_retrying"
  | "plan_completed"
  | "plan_failed"
  | "plan_cancelled";

/**
 * Request to approve a pending step
 */
export interface StepApproval {
  planId: string;
  stepId: string;
  approved: boolean;
  approvedBy: string;
  approvedAt: number;
  comment?: string;
}

/**
 * Plan template for common multi-step operations
 */
export interface PlanTemplate {
  templateId: string;
  name: string;
  description: string;
  triggerActions: string[];
  steps: PlanStepTemplate[];
}

/**
 * Template for a plan step
 */
export interface PlanStepTemplate {
  action: StepAction;
  description: string;
  parameterMapping: Record<string, string>;
  dependsOn: number[];
  requiresSoulVerification: boolean;
  optional: boolean;
}
