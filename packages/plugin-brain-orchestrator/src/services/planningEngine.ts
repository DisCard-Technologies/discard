/**
 * Planning Engine Service
 *
 * Creates and manages multi-step execution plans
 * for complex user requests.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ExecutionPlan,
  PlanStep,
  PlanStatus,
  StepStatus,
  StepAction,
  StepResult,
  PlanExecutionEvent,
  PlanEventType,
  PlanTemplate,
} from "../types/plan.js";
import type { ParsedIntent } from "../types/intent.js";
import type { SoulClient } from "./soulClient.js";

/**
 * Configuration for planning engine
 */
export interface PlanningEngineConfig {
  maxStepsPerPlan: number;
  defaultTimeoutMs: number;
  maxRetries: number;
  requireApprovalByDefault: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PlanningEngineConfig = {
  maxStepsPerPlan: 10,
  defaultTimeoutMs: 30000,
  maxRetries: 2,
  requireApprovalByDefault: true,
};

/**
 * Built-in plan templates
 */
const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    templateId: "fund_card",
    name: "Fund Card",
    description: "Transfer funds from wallet to card",
    triggerActions: ["fund_card"],
    steps: [
      {
        action: "verify_with_soul",
        description: "Verify transaction with Soul",
        parameterMapping: { intent: "intent" },
        dependsOn: [],
        requiresSoulVerification: true,
        optional: false,
      },
      {
        action: "fund_card",
        description: "Execute card funding",
        parameterMapping: { amount: "amount", cardId: "targetId" },
        dependsOn: [0],
        requiresSoulVerification: false,
        optional: false,
      },
      {
        action: "notify_user",
        description: "Notify user of completion",
        parameterMapping: { result: "result" },
        dependsOn: [1],
        requiresSoulVerification: false,
        optional: true,
      },
    ],
  },
  {
    templateId: "transfer",
    name: "Transfer Funds",
    description: "Transfer funds to another wallet",
    triggerActions: ["transfer"],
    steps: [
      {
        action: "check_balance",
        description: "Verify sufficient balance",
        parameterMapping: { amount: "amount" },
        dependsOn: [],
        requiresSoulVerification: false,
        optional: false,
      },
      {
        action: "verify_with_soul",
        description: "Verify transaction with Soul",
        parameterMapping: { intent: "intent" },
        dependsOn: [0],
        requiresSoulVerification: true,
        optional: false,
      },
      {
        action: "request_approval",
        description: "Request user approval",
        parameterMapping: { amount: "amount", target: "targetId" },
        dependsOn: [1],
        requiresSoulVerification: false,
        optional: false,
      },
      {
        action: "execute_transfer",
        description: "Execute the transfer",
        parameterMapping: { amount: "amount", target: "targetId" },
        dependsOn: [2],
        requiresSoulVerification: false,
        optional: false,
      },
    ],
  },
  {
    templateId: "swap",
    name: "Swap Tokens",
    description: "Swap one token for another",
    triggerActions: ["swap"],
    steps: [
      {
        action: "check_balance",
        description: "Verify sufficient balance",
        parameterMapping: { amount: "amount", currency: "currency" },
        dependsOn: [],
        requiresSoulVerification: false,
        optional: false,
      },
      {
        action: "verify_with_soul",
        description: "Verify swap with Soul",
        parameterMapping: { intent: "intent" },
        dependsOn: [0],
        requiresSoulVerification: true,
        optional: false,
      },
      {
        action: "execute_swap",
        description: "Execute the swap",
        parameterMapping: { amount: "amount", fromCurrency: "currency", toCurrency: "targetCurrency" },
        dependsOn: [1],
        requiresSoulVerification: false,
        optional: false,
      },
    ],
  },
];

/**
 * Planning Engine Service
 */
export class PlanningEngine {
  private config: PlanningEngineConfig;
  private templates: Map<string, PlanTemplate>;
  private plans: Map<string, ExecutionPlan>;
  private soulClient: SoulClient;
  private eventListeners: Map<string, (event: PlanExecutionEvent) => void>;

  constructor(soulClient: SoulClient, config?: Partial<PlanningEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.soulClient = soulClient;
    this.plans = new Map();
    this.eventListeners = new Map();

    // Load templates
    this.templates = new Map();
    for (const template of PLAN_TEMPLATES) {
      this.templates.set(template.templateId, template);
    }
  }

  /**
   * Create a plan from an intent
   */
  createPlanFromIntent(
    intent: ParsedIntent,
    sessionId: string,
    userId: string
  ): ExecutionPlan {
    // Find matching template
    const template = this.findTemplate(intent.action);

    if (template) {
      return this.createPlanFromTemplate(template, intent, sessionId, userId);
    }

    // Create single-step plan for simple actions
    return this.createSimplePlan(intent, sessionId, userId);
  }

  /**
   * Find matching template for action
   */
  private findTemplate(action: string): PlanTemplate | undefined {
    for (const template of this.templates.values()) {
      if (template.triggerActions.includes(action)) {
        return template;
      }
    }
    return undefined;
  }

  /**
   * Create plan from template
   */
  private createPlanFromTemplate(
    template: PlanTemplate,
    intent: ParsedIntent,
    sessionId: string,
    userId: string
  ): ExecutionPlan {
    const planId = uuidv4();
    const now = Date.now();

    const steps: PlanStep[] = template.steps.map((stepTemplate, index) => ({
      stepId: uuidv4(),
      planId,
      sequence: index,
      action: stepTemplate.action,
      description: stepTemplate.description,
      parameters: this.mapParameters(stepTemplate.parameterMapping, intent),
      dependsOn: stepTemplate.dependsOn.map((i) => `step-${i}`),
      requiresSoulVerification: stepTemplate.requiresSoulVerification,
      status: "pending" as StepStatus,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
    }));

    // Update step dependencies to use actual IDs
    for (let i = 0; i < steps.length; i++) {
      steps[i].dependsOn = template.steps[i].dependsOn.map(
        (depIndex) => steps[depIndex].stepId
      );
    }

    const plan: ExecutionPlan = {
      planId,
      sessionId,
      userId,
      originalIntent: intent,
      steps,
      status: "pending",
      createdAt: now,
      totalSteps: steps.length,
      completedSteps: 0,
      requiresApproval: this.config.requireApprovalByDefault,
    };

    this.plans.set(planId, plan);
    return plan;
  }

  /**
   * Create simple single-step plan
   */
  private createSimplePlan(
    intent: ParsedIntent,
    sessionId: string,
    userId: string
  ): ExecutionPlan {
    const planId = uuidv4();
    const stepId = uuidv4();
    const now = Date.now();

    const step: PlanStep = {
      stepId,
      planId,
      sequence: 0,
      action: this.intentToStepAction(intent.action),
      description: `Execute ${intent.action}`,
      parameters: {
        intentId: intent.intentId,
        action: intent.action,
        amount: intent.amount?.toString() || "",
        currency: intent.currency || "USDC",
      },
      dependsOn: [],
      requiresSoulVerification: this.requiresVerification(intent.action),
      status: "pending",
      retryCount: 0,
      maxRetries: this.config.maxRetries,
    };

    const plan: ExecutionPlan = {
      planId,
      sessionId,
      userId,
      originalIntent: intent,
      steps: [step],
      status: "pending",
      createdAt: now,
      totalSteps: 1,
      completedSteps: 0,
      requiresApproval: this.config.requireApprovalByDefault,
    };

    this.plans.set(planId, plan);
    return plan;
  }

  /**
   * Map template parameters to actual values
   */
  private mapParameters(
    mapping: Record<string, string>,
    intent: ParsedIntent
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    for (const [param, intentField] of Object.entries(mapping)) {
      switch (intentField) {
        case "intent":
          params[param] = intent;
          break;
        case "amount":
          params[param] = intent.amount;
          break;
        case "currency":
          params[param] = intent.currency;
          break;
        case "targetId":
          params[param] = intent.targetId;
          break;
        case "sourceId":
          params[param] = intent.sourceId;
          break;
        case "merchant":
          params[param] = intent.merchant;
          break;
        default:
          params[param] = (intent as any)[intentField];
      }
    }

    return params;
  }

  /**
   * Convert intent action to step action
   */
  private intentToStepAction(action: string): StepAction {
    const mapping: Record<string, StepAction> = {
      fund_card: "fund_card",
      transfer: "execute_transfer",
      swap: "execute_swap",
      withdraw_defi: "execute_transfer",
      create_card: "create_card",
      freeze_card: "freeze_card",
    };
    return mapping[action] || "notify_user";
  }

  /**
   * Check if action requires Soul verification
   */
  private requiresVerification(action: string): boolean {
    const verificationRequired = [
      "fund_card",
      "transfer",
      "swap",
      "withdraw_defi",
      "pay_bill",
    ];
    return verificationRequired.includes(action);
  }

  /**
   * Execute a plan
   */
  async executePlan(
    planId: string,
    onEvent: (event: PlanExecutionEvent) => void
  ): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    plan.status = "executing";
    plan.startedAt = Date.now();

    this.emitEvent(plan, "plan_started", "Plan execution started");

    try {
      await this.executeSteps(plan, onEvent);

      plan.status = "completed";
      plan.completedAt = Date.now();
      this.emitEvent(plan, "plan_completed", "Plan execution completed");
    } catch (error) {
      plan.status = "failed";
      plan.completedAt = Date.now();
      this.emitEvent(
        plan,
        "plan_failed",
        `Plan failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      throw error;
    }
  }

  /**
   * Execute plan steps in order
   */
  private async executeSteps(
    plan: ExecutionPlan,
    onEvent: (event: PlanExecutionEvent) => void
  ): Promise<void> {
    const completedSteps = new Set<string>();

    for (const step of plan.steps) {
      // Check dependencies
      const dependenciesMet = step.dependsOn.every((depId) =>
        completedSteps.has(depId)
      );

      if (!dependenciesMet) {
        step.status = "blocked";
        continue;
      }

      // Execute step
      await this.executeStep(plan, step, onEvent);

      if (step.status === "completed") {
        completedSteps.add(step.stepId);
        plan.completedSteps++;
      } else if (step.status === "failed") {
        throw new Error(`Step ${step.stepId} failed`);
      }
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    plan: ExecutionPlan,
    step: PlanStep,
    onEvent: (event: PlanExecutionEvent) => void
  ): Promise<void> {
    step.status = "executing";
    step.startedAt = Date.now();

    const event = this.createEvent(plan, step, "step_started", "Step started");
    onEvent(event);

    try {
      // Check if Soul verification is needed
      if (step.requiresSoulVerification) {
        step.status = "awaiting_approval";
        const verifyEvent = this.createEvent(
          plan,
          step,
          "step_awaiting_approval",
          "Awaiting Soul verification"
        );
        onEvent(verifyEvent);

        // In real implementation, would call Soul here
        // For now, simulate verification
        await this.sleep(100);

        step.status = "verified_by_soul";
        const verifiedEvent = this.createEvent(
          plan,
          step,
          "step_verified",
          "Step verified by Soul"
        );
        onEvent(verifiedEvent);
      }

      // Execute the action
      const result = await this.executeAction(step);
      step.result = result;
      step.status = result.success ? "completed" : "failed";
      step.completedAt = Date.now();

      const completedEvent = this.createEvent(
        plan,
        step,
        step.status === "completed" ? "step_completed" : "step_failed",
        step.status === "completed" ? "Step completed" : "Step failed"
      );
      onEvent(completedEvent);
    } catch (error) {
      step.status = "failed";
      step.completedAt = Date.now();
      step.result = {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          recoverable: step.retryCount < step.maxRetries,
        },
        durationMs: Date.now() - (step.startedAt || Date.now()),
      };

      const failedEvent = this.createEvent(plan, step, "step_failed", "Step failed");
      onEvent(failedEvent);
    }
  }

  /**
   * Execute a step action
   */
  private async executeAction(step: PlanStep): Promise<StepResult> {
    const startTime = Date.now();

    // Simulate action execution
    // In real implementation, would call appropriate services
    await this.sleep(100);

    return {
      success: true,
      output: { executed: true },
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Create an event
   */
  private createEvent(
    plan: ExecutionPlan,
    step: PlanStep | null,
    eventType: PlanEventType,
    message: string
  ): PlanExecutionEvent {
    return {
      eventId: uuidv4(),
      planId: plan.planId,
      stepId: step?.stepId,
      eventType,
      message,
      timestamp: Date.now(),
    };
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(
    plan: ExecutionPlan,
    eventType: PlanEventType,
    message: string
  ): void {
    const event = this.createEvent(plan, null, eventType, message);
    const listener = this.eventListeners.get(plan.planId);
    if (listener) {
      listener(event);
    }
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): ExecutionPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * Get plans for session
   */
  getPlansForSession(sessionId: string): ExecutionPlan[] {
    return Array.from(this.plans.values()).filter(
      (p) => p.sessionId === sessionId
    );
  }

  /**
   * Cancel a plan
   */
  cancelPlan(planId: string): boolean {
    const plan = this.plans.get(planId);
    if (!plan || plan.status === "completed" || plan.status === "cancelled") {
      return false;
    }

    plan.status = "cancelled";
    plan.completedAt = Date.now();
    this.emitEvent(plan, "plan_cancelled", "Plan cancelled");
    return true;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Add custom template
   */
  addTemplate(template: PlanTemplate): void {
    this.templates.set(template.templateId, template);
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.plans.clear();
    this.templates.clear();
    this.eventListeners.clear();
  }
}
