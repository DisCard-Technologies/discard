/**
 * Strategy Builder
 *
 * Guides users through strategy creation with conversational flows.
 * Supports DCA, Stop-Loss, Take-Profit, and Goal strategies.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Strategy, DCAConfig, StopLossConfig, TakeProfitConfig } from '../types/strategy.js';
import type {
  GoalConfig,
  GoalStrategy,
  YieldHarvesterStrategy,
  DCAGoalStrategy,
  RiskTolerance,
  YieldProtocol,
} from '../types/goal.js';
import type { StrategyStore } from './strategyStore.js';

// ============================================================================
// Configuration
// ============================================================================

export interface StrategyBuilderConfig {
  /** Default slippage tolerance for swaps */
  defaultSlippageTolerance: number;
  /** Supported tokens for strategies */
  supportedTokens: string[];
  /** Maximum strategies per user */
  maxStrategiesPerUser: number;
}

const DEFAULT_CONFIG: StrategyBuilderConfig = {
  defaultSlippageTolerance: 0.01, // 1%
  supportedTokens: ['SOL', 'USDC', 'USDT', 'JUP', 'BONK'],
  maxStrategiesPerUser: 10,
};

// ============================================================================
// Conversation Types
// ============================================================================

export type ConversationState =
  | 'idle'
  | 'awaiting_type'
  | 'awaiting_token'
  | 'awaiting_amount'
  | 'awaiting_frequency'
  | 'awaiting_limit'
  | 'awaiting_price'
  | 'awaiting_sell_amount'
  | 'awaiting_goal_amount'
  | 'awaiting_deadline'
  | 'awaiting_contribution'
  | 'awaiting_risk_tolerance'
  | 'awaiting_yield_optimization'
  | 'awaiting_confirmation'
  | 'completed'
  | 'cancelled';

export interface ConversationContext {
  sessionId: string;
  userId: string;
  state: ConversationState;
  strategyType?: 'dca' | 'stop_loss' | 'take_profit' | 'goal';
  data: Partial<BuilderData>;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  options?: ConversationOption[];
}

export interface ConversationOption {
  label: string;
  value: string;
  description?: string;
}

export interface BuilderData {
  // Common
  name?: string;
  token?: string;
  quoteCurrency?: string;

  // DCA
  fromToken?: string;
  toToken?: string;
  amountPerExecution?: number;
  frequency?: 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
  maxTotalAmount?: number;
  maxExecutions?: number;
  endDate?: number;
  targetAccumulation?: number;

  // Stop-Loss / Take-Profit
  triggerPrice?: number;
  triggerType?: 'below' | 'above';
  amountToSell?: 'all' | 'percentage' | 'fixed';
  sellAmount?: number;
  slippageTolerance?: number;

  // Goal
  goalType?: 'save' | 'accumulate' | 'grow' | 'income';
  targetAmount?: number;
  targetToken?: string;
  deadline?: number;
  contributionAmount?: number;
  contributionFrequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  riskTolerance?: RiskTolerance;
  enableYieldOptimization?: boolean;
  yieldStrategy?: YieldHarvesterStrategy;
}

export interface BuilderResponse {
  message: string;
  options?: ConversationOption[];
  strategy?: Strategy;
  complete: boolean;
  error?: string;
}

// ============================================================================
// Strategy Builder
// ============================================================================

export class StrategyBuilder {
  private config: StrategyBuilderConfig;
  private store: StrategyStore;
  private sessions: Map<string, ConversationContext> = new Map();

  constructor(store: StrategyStore, config: Partial<StrategyBuilderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = store;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Start a new strategy building session
   */
  startSession(userId: string, initialMessage?: string): ConversationContext {
    const sessionId = `session_${uuidv4()}`;
    const context: ConversationContext = {
      sessionId,
      userId,
      state: 'idle',
      data: {},
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, context);

    if (initialMessage) {
      this.addMessage(context, 'user', initialMessage);
    }

    return context;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): ConversationContext | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * End a session
   */
  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private addMessage(
    context: ConversationContext,
    role: 'user' | 'assistant',
    content: string,
    options?: ConversationOption[]
  ): void {
    context.messages.push({
      role,
      content,
      timestamp: Date.now(),
      options,
    });
    context.updatedAt = Date.now();
  }

  // ==========================================================================
  // Main Processing
  // ==========================================================================

  /**
   * Process user input and advance the conversation
   */
  async processInput(sessionId: string, userInput: string): Promise<BuilderResponse> {
    const context = this.sessions.get(sessionId);
    if (!context) {
      return {
        message: 'Session not found. Please start a new conversation.',
        complete: false,
        error: 'SESSION_NOT_FOUND',
      };
    }

    this.addMessage(context, 'user', userInput);

    try {
      const response = await this.handleState(context, userInput);
      this.addMessage(context, 'assistant', response.message, response.options);
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        message: `Sorry, something went wrong: ${errorMessage}. Please try again.`,
        complete: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle the current conversation state
   */
  private async handleState(
    context: ConversationContext,
    input: string
  ): Promise<BuilderResponse> {
    const normalizedInput = input.toLowerCase().trim();

    // Handle cancel at any point
    if (normalizedInput === 'cancel' || normalizedInput === 'quit' || normalizedInput === 'exit') {
      context.state = 'cancelled';
      return {
        message: 'Strategy creation cancelled. Let me know if you want to start over.',
        complete: true,
      };
    }

    switch (context.state) {
      case 'idle':
        return this.handleIdle(context, normalizedInput);

      case 'awaiting_type':
        return this.handleAwaitingType(context, normalizedInput);

      // DCA States
      case 'awaiting_token':
        return this.handleAwaitingToken(context, normalizedInput);
      case 'awaiting_amount':
        return this.handleAwaitingAmount(context, normalizedInput);
      case 'awaiting_frequency':
        return this.handleAwaitingFrequency(context, normalizedInput);
      case 'awaiting_limit':
        return this.handleAwaitingLimit(context, normalizedInput);

      // Stop-Loss / Take-Profit States
      case 'awaiting_price':
        return this.handleAwaitingPrice(context, normalizedInput);
      case 'awaiting_sell_amount':
        return this.handleAwaitingSellAmount(context, normalizedInput);

      // Goal States
      case 'awaiting_goal_amount':
        return this.handleAwaitingGoalAmount(context, normalizedInput);
      case 'awaiting_deadline':
        return this.handleAwaitingDeadline(context, normalizedInput);
      case 'awaiting_contribution':
        return this.handleAwaitingContribution(context, normalizedInput);
      case 'awaiting_yield_optimization':
        return this.handleAwaitingYieldOptimization(context, normalizedInput);
      case 'awaiting_risk_tolerance':
        return this.handleAwaitingRiskTolerance(context, normalizedInput);

      // Confirmation
      case 'awaiting_confirmation':
        return this.handleAwaitingConfirmation(context, normalizedInput);

      default:
        return {
          message: "I'm not sure what to do next. Let's start over.",
          complete: false,
        };
    }
  }

  // ==========================================================================
  // State Handlers - Initial
  // ==========================================================================

  private handleIdle(context: ConversationContext, input: string): BuilderResponse {
    // Detect intent from initial message
    if (this.matchesDCAIntent(input)) {
      context.strategyType = 'dca';
      return this.startDCAFlow(context, input);
    }

    if (this.matchesStopLossIntent(input)) {
      context.strategyType = 'stop_loss';
      return this.startStopLossFlow(context, input);
    }

    if (this.matchesTakeProfitIntent(input)) {
      context.strategyType = 'take_profit';
      return this.startTakeProfitFlow(context, input);
    }

    if (this.matchesGoalIntent(input)) {
      context.strategyType = 'goal';
      return this.startGoalFlow(context, input);
    }

    // Ask what type of strategy
    context.state = 'awaiting_type';
    return {
      message:
        "I can help you set up an automated strategy. What would you like to create?",
      options: [
        { label: 'DCA (Dollar Cost Average)', value: 'dca', description: 'Buy regularly over time' },
        { label: 'Stop-Loss', value: 'stop_loss', description: 'Sell if price drops' },
        { label: 'Take-Profit', value: 'take_profit', description: 'Sell when price rises' },
        { label: 'Savings Goal', value: 'goal', description: 'Save toward a target amount' },
      ],
      complete: false,
    };
  }

  private handleAwaitingType(context: ConversationContext, input: string): BuilderResponse {
    if (input.includes('dca') || input.includes('dollar cost')) {
      context.strategyType = 'dca';
      return this.startDCAFlow(context, input);
    }

    if (input.includes('stop') || input.includes('loss')) {
      context.strategyType = 'stop_loss';
      return this.startStopLossFlow(context, input);
    }

    if (input.includes('take') || input.includes('profit')) {
      context.strategyType = 'take_profit';
      return this.startTakeProfitFlow(context, input);
    }

    if (input.includes('goal') || input.includes('save') || input.includes('saving')) {
      context.strategyType = 'goal';
      return this.startGoalFlow(context, input);
    }

    return {
      message: "I didn't understand that. Please choose DCA, Stop-Loss, Take-Profit, or Goal.",
      options: [
        { label: 'DCA', value: 'dca' },
        { label: 'Stop-Loss', value: 'stop_loss' },
        { label: 'Take-Profit', value: 'take_profit' },
        { label: 'Savings Goal', value: 'goal' },
      ],
      complete: false,
    };
  }

  // ==========================================================================
  // DCA Flow
  // ==========================================================================

  private startDCAFlow(context: ConversationContext, input: string): BuilderResponse {
    // Try to extract token from input
    const token = this.extractToken(input);
    if (token) {
      context.data.toToken = token;
      context.data.fromToken = 'USDC';
      context.state = 'awaiting_amount';
      return {
        message: `Great, I'll help you set up DCA for ${token}. How much do you want to invest each time? (e.g., "$50" or "50 USDC")`,
        complete: false,
      };
    }

    context.state = 'awaiting_token';
    return {
      message: 'Which token do you want to accumulate through DCA?',
      options: this.config.supportedTokens.map((t) => ({ label: t, value: t })),
      complete: false,
    };
  }

  private handleAwaitingToken(context: ConversationContext, input: string): BuilderResponse {
    const token = this.extractToken(input) || input.toUpperCase();

    if (!this.config.supportedTokens.includes(token)) {
      return {
        message: `Sorry, ${token} is not supported yet. Please choose from: ${this.config.supportedTokens.join(', ')}`,
        options: this.config.supportedTokens.map((t) => ({ label: t, value: t })),
        complete: false,
      };
    }

    context.data.toToken = token;
    context.data.fromToken = token === 'USDC' ? 'SOL' : 'USDC';
    context.state = 'awaiting_amount';

    return {
      message: `Got it, DCA into ${token}. How much do you want to invest each time?`,
      complete: false,
    };
  }

  private handleAwaitingAmount(context: ConversationContext, input: string): BuilderResponse {
    const amount = this.extractAmount(input);

    if (!amount || amount <= 0) {
      return {
        message: 'Please enter a valid amount (e.g., "$50" or "100").',
        complete: false,
      };
    }

    if (amount < 1) {
      return {
        message: 'Minimum amount is $1. Please enter a higher amount.',
        complete: false,
      };
    }

    context.data.amountPerExecution = amount;
    context.state = 'awaiting_frequency';

    return {
      message: `$${amount} per purchase. How often should I buy?`,
      options: [
        { label: 'Daily', value: 'daily' },
        { label: 'Weekly', value: 'weekly' },
        { label: 'Biweekly', value: 'biweekly' },
        { label: 'Monthly', value: 'monthly' },
      ],
      complete: false,
    };
  }

  private handleAwaitingFrequency(context: ConversationContext, input: string): BuilderResponse {
    const frequency = this.extractFrequency(input);

    if (!frequency) {
      return {
        message: 'Please choose: daily, weekly, biweekly, or monthly.',
        options: [
          { label: 'Daily', value: 'daily' },
          { label: 'Weekly', value: 'weekly' },
          { label: 'Biweekly', value: 'biweekly' },
          { label: 'Monthly', value: 'monthly' },
        ],
        complete: false,
      };
    }

    context.data.frequency = frequency;
    context.state = 'awaiting_limit';

    return {
      message: 'Would you like to set an end condition? You can specify a total amount, number of purchases, target accumulation, or no limit.',
      options: [
        { label: 'No limit (run indefinitely)', value: 'no_limit' },
        { label: 'Total investment amount', value: 'total_amount' },
        { label: 'Number of purchases', value: 'num_purchases' },
        { label: 'Target token amount', value: 'target_amount' },
      ],
      complete: false,
    };
  }

  private handleAwaitingLimit(context: ConversationContext, input: string): BuilderResponse {
    if (input.includes('no') || input.includes('indefinite') || input.includes('no_limit')) {
      // No limit set
      return this.finalizeDCAStrategy(context);
    }

    // Try to extract a number
    const amount = this.extractAmount(input);

    if (input.includes('total') || input.includes('spend')) {
      if (amount) {
        context.data.maxTotalAmount = amount;
        return this.finalizeDCAStrategy(context);
      }
      return {
        message: 'What\'s the maximum total amount you want to invest? (e.g., "$1000")',
        complete: false,
      };
    }

    if (input.includes('purchase') || input.includes('time') || input.includes('execution')) {
      if (amount) {
        context.data.maxExecutions = Math.floor(amount);
        return this.finalizeDCAStrategy(context);
      }
      return {
        message: 'How many purchases do you want to make? (e.g., "20")',
        complete: false,
      };
    }

    if (input.includes('target') || input.includes('accumulate') || input.includes('until')) {
      if (amount) {
        context.data.targetAccumulation = amount;
        return this.finalizeDCAStrategy(context);
      }
      return {
        message: `How much ${context.data.toToken} do you want to accumulate? (e.g., "10 ${context.data.toToken}")`,
        complete: false,
      };
    }

    // If just a number, ask for clarification
    if (amount) {
      return {
        message: `Is "${amount}" a total investment amount, number of purchases, or target ${context.data.toToken} amount?`,
        options: [
          { label: `$${amount} total investment`, value: `total ${amount}` },
          { label: `${amount} purchases`, value: `purchases ${amount}` },
          { label: `${amount} ${context.data.toToken} target`, value: `target ${amount}` },
        ],
        complete: false,
      };
    }

    return {
      message: 'Please specify your limit or say "no limit" to run indefinitely.',
      complete: false,
    };
  }

  private finalizeDCAStrategy(context: ConversationContext): BuilderResponse {
    const { toToken, fromToken, amountPerExecution, frequency, maxTotalAmount, maxExecutions, targetAccumulation } = context.data;

    // Calculate estimates
    const estimatedWeeks = maxTotalAmount
      ? Math.ceil(maxTotalAmount / (amountPerExecution || 50) / this.frequencyMultiplier(frequency || 'weekly'))
      : maxExecutions
        ? Math.ceil(maxExecutions / this.frequencyMultiplier(frequency || 'weekly'))
        : null;

    let summary = `Here's your DCA strategy:\n\n`;
    summary += `• Buy ${toToken} with ${fromToken}\n`;
    summary += `• Amount: $${amountPerExecution} per purchase\n`;
    summary += `• Frequency: ${this.capitalizeFirst(frequency || 'weekly')}\n`;

    if (maxTotalAmount) {
      summary += `• Stop after: $${maxTotalAmount} total invested\n`;
    } else if (maxExecutions) {
      summary += `• Stop after: ${maxExecutions} purchases\n`;
    } else if (targetAccumulation) {
      summary += `• Stop when: ${targetAccumulation} ${toToken} accumulated\n`;
    } else {
      summary += `• No end condition (runs until cancelled)\n`;
    }

    if (estimatedWeeks) {
      summary += `\n📊 Estimated duration: ~${estimatedWeeks} weeks`;
    }

    summary += '\n\nReady to activate this strategy?';

    context.state = 'awaiting_confirmation';
    return {
      message: summary,
      options: [
        { label: 'Confirm & Activate', value: 'confirm' },
        { label: 'Edit', value: 'edit' },
        { label: 'Cancel', value: 'cancel' },
      ],
      complete: false,
    };
  }

  // ==========================================================================
  // Stop-Loss Flow
  // ==========================================================================

  private startStopLossFlow(context: ConversationContext, input: string): BuilderResponse {
    const token = this.extractToken(input);
    const price = this.extractPrice(input);

    if (token) {
      context.data.token = token;
      context.data.triggerType = 'below';

      if (price) {
        context.data.triggerPrice = price;
        context.state = 'awaiting_sell_amount';
        return {
          message: `Set stop-loss for ${token} at $${price}. How much do you want to sell when triggered?`,
          options: [
            { label: 'Sell all', value: 'all' },
            { label: 'Sell 50%', value: '50%' },
            { label: 'Sell 25%', value: '25%' },
            { label: 'Custom amount', value: 'custom' },
          ],
          complete: false,
        };
      }

      context.state = 'awaiting_price';
      return {
        message: `At what price should I trigger the stop-loss for ${token}? (Current price: ~$150)`,
        complete: false,
      };
    }

    context.state = 'awaiting_token';
    return {
      message: 'Which token do you want to set a stop-loss for?',
      options: this.config.supportedTokens
        .filter((t) => t !== 'USDC' && t !== 'USDT')
        .map((t) => ({ label: t, value: t })),
      complete: false,
    };
  }

  private handleAwaitingPrice(context: ConversationContext, input: string): BuilderResponse {
    const price = this.extractPrice(input) || this.extractAmount(input);

    if (!price || price <= 0) {
      return {
        message: 'Please enter a valid price (e.g., "$100" or "100").',
        complete: false,
      };
    }

    context.data.triggerPrice = price;
    context.state = 'awaiting_sell_amount';

    const action = context.strategyType === 'stop_loss' ? 'drops to' : 'reaches';
    return {
      message: `Got it, trigger when ${context.data.token} ${action} $${price}. How much do you want to sell?`,
      options: [
        { label: 'Sell all', value: 'all' },
        { label: 'Sell 50%', value: '50%' },
        { label: 'Sell 25%', value: '25%' },
        { label: 'Custom amount', value: 'custom' },
      ],
      complete: false,
    };
  }

  private handleAwaitingSellAmount(context: ConversationContext, input: string): BuilderResponse {
    if (input.includes('all') || input === '100%' || input === '100') {
      context.data.amountToSell = 'all';
      context.data.sellAmount = 100;
    } else if (input.includes('%')) {
      const pct = this.extractAmount(input);
      if (pct && pct > 0 && pct <= 100) {
        context.data.amountToSell = 'percentage';
        context.data.sellAmount = pct;
      } else {
        return {
          message: 'Please enter a valid percentage between 1% and 100%.',
          complete: false,
        };
      }
    } else if (input.includes('custom')) {
      return {
        message: 'Enter the amount to sell (e.g., "5 SOL" or "50%"):',
        complete: false,
      };
    } else {
      const amount = this.extractAmount(input);
      if (amount) {
        context.data.amountToSell = 'fixed';
        context.data.sellAmount = amount;
      } else {
        return {
          message: 'Please specify how much to sell (e.g., "all", "50%", or "5 SOL").',
          complete: false,
        };
      }
    }

    return this.finalizeStopLossOrTakeProfitStrategy(context);
  }

  private finalizeStopLossOrTakeProfitStrategy(context: ConversationContext): BuilderResponse {
    const { token, triggerPrice, amountToSell, sellAmount } = context.data;
    const isStopLoss = context.strategyType === 'stop_loss';

    let summary = `Here's your ${isStopLoss ? 'Stop-Loss' : 'Take-Profit'} strategy:\n\n`;
    summary += `• Token: ${token}\n`;
    summary += `• Trigger: ${isStopLoss ? 'Price drops below' : 'Price rises above'} $${triggerPrice}\n`;
    summary += `• Action: Sell ${amountToSell === 'all' ? 'all' : amountToSell === 'percentage' ? `${sellAmount}%` : `${sellAmount} ${token}`}\n`;
    summary += `• Slippage tolerance: ${(this.config.defaultSlippageTolerance * 100).toFixed(1)}%\n`;

    summary += '\n\nReady to activate this strategy?';

    context.state = 'awaiting_confirmation';
    return {
      message: summary,
      options: [
        { label: 'Confirm & Activate', value: 'confirm' },
        { label: 'Edit', value: 'edit' },
        { label: 'Cancel', value: 'cancel' },
      ],
      complete: false,
    };
  }

  // ==========================================================================
  // Take-Profit Flow
  // ==========================================================================

  private startTakeProfitFlow(context: ConversationContext, input: string): BuilderResponse {
    context.data.triggerType = 'above';
    return this.startStopLossFlow(context, input); // Reuse stop-loss flow with different trigger type
  }

  // ==========================================================================
  // Goal Flow
  // ==========================================================================

  private startGoalFlow(context: ConversationContext, input: string): BuilderResponse {
    // Try to extract goal amount from input
    const amount = this.extractAmount(input);

    if (amount) {
      context.data.targetAmount = amount;
      context.data.targetToken = 'USDC';
      context.data.goalType = 'save';
      context.state = 'awaiting_deadline';
      return {
        message: `Great, you want to save $${amount.toLocaleString()}. By when do you want to reach this goal?`,
        options: [
          { label: '3 months', value: '3_months' },
          { label: '6 months', value: '6_months' },
          { label: '1 year', value: '1_year' },
          { label: 'No specific deadline', value: 'no_deadline' },
        ],
        complete: false,
      };
    }

    context.state = 'awaiting_goal_amount';
    return {
      message: 'How much do you want to save? (e.g., "$5000" or "10000")',
      complete: false,
    };
  }

  private handleAwaitingGoalAmount(context: ConversationContext, input: string): BuilderResponse {
    const amount = this.extractAmount(input);

    if (!amount || amount <= 0) {
      return {
        message: 'Please enter a valid amount (e.g., "$5000").',
        complete: false,
      };
    }

    context.data.targetAmount = amount;
    context.data.targetToken = 'USDC';
    context.data.goalType = 'save';
    context.state = 'awaiting_deadline';

    return {
      message: `$${amount.toLocaleString()} savings goal. By when do you want to reach this?`,
      options: [
        { label: '3 months', value: '3_months' },
        { label: '6 months', value: '6_months' },
        { label: '1 year', value: '1_year' },
        { label: 'No specific deadline', value: 'no_deadline' },
      ],
      complete: false,
    };
  }

  private handleAwaitingDeadline(context: ConversationContext, input: string): BuilderResponse {
    let deadline: number | undefined;

    if (input.includes('3') && input.includes('month')) {
      deadline = Date.now() + 90 * 24 * 60 * 60 * 1000;
    } else if (input.includes('6') && input.includes('month')) {
      deadline = Date.now() + 180 * 24 * 60 * 60 * 1000;
    } else if (input.includes('1') && input.includes('year')) {
      deadline = Date.now() + 365 * 24 * 60 * 60 * 1000;
    } else if (input.includes('no') || input.includes('none')) {
      deadline = undefined;
    } else {
      // Try to parse a date
      const parsed = Date.parse(input);
      if (!isNaN(parsed) && parsed > Date.now()) {
        deadline = parsed;
      }
    }

    context.data.deadline = deadline;
    context.state = 'awaiting_contribution';

    const deadlineText = deadline
      ? `by ${new Date(deadline).toLocaleDateString()}`
      : 'with no specific deadline';

    return {
      message: `Goal: $${context.data.targetAmount?.toLocaleString()} ${deadlineText}.\n\nHow much can you contribute regularly?`,
      options: [
        { label: '$50/week', value: '50_weekly' },
        { label: '$100/week', value: '100_weekly' },
        { label: '$200/month', value: '200_monthly' },
        { label: '$500/month', value: '500_monthly' },
        { label: 'Custom amount', value: 'custom' },
      ],
      complete: false,
    };
  }

  private handleAwaitingContribution(context: ConversationContext, input: string): BuilderResponse {
    let amount: number | undefined;
    let frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' = 'weekly';

    // Parse predefined options
    if (input.includes('50') && input.includes('week')) {
      amount = 50;
      frequency = 'weekly';
    } else if (input.includes('100') && input.includes('week')) {
      amount = 100;
      frequency = 'weekly';
    } else if (input.includes('200') && input.includes('month')) {
      amount = 200;
      frequency = 'monthly';
    } else if (input.includes('500') && input.includes('month')) {
      amount = 500;
      frequency = 'monthly';
    } else if (input.includes('custom')) {
      return {
        message: 'How much would you like to contribute and how often? (e.g., "$100 weekly" or "$300 monthly")',
        complete: false,
      };
    } else {
      amount = this.extractAmount(input) ?? undefined;
      const extractedFreq = this.extractFrequency(input);
      // Filter out 'hourly' since contributionFrequency doesn't support it
      frequency = extractedFreq && extractedFreq !== 'hourly' ? extractedFreq : 'weekly';
    }

    if (!amount || amount <= 0) {
      return {
        message: 'Please enter a valid contribution amount.',
        complete: false,
      };
    }

    context.data.contributionAmount = amount;
    context.data.contributionFrequency = frequency;

    // Calculate projections
    const targetAmount = context.data.targetAmount || 0;
    const deadline = context.data.deadline;
    const weeklyContribution = this.toWeeklyAmount(amount, frequency);
    const weeksToGoal = Math.ceil(targetAmount / weeklyContribution);

    let projection = '';
    if (deadline) {
      const weeksToDeadline = Math.ceil((deadline - Date.now()) / (7 * 24 * 60 * 60 * 1000));
      const projectedSavings = weeklyContribution * weeksToDeadline;
      const percentOfGoal = Math.round((projectedSavings / targetAmount) * 100);

      projection = `\n\n📊 Projection with $${amount}/${frequency}:\n`;
      projection += `• Savings by deadline: $${projectedSavings.toLocaleString()} (${percentOfGoal}% of goal)\n`;

      if (projectedSavings < targetAmount) {
        projection += `• Gap: $${(targetAmount - projectedSavings).toLocaleString()}\n`;
        projection += `\n💡 Want me to help close the gap with yield optimization?`;
      } else {
        projection += `• You'll reach your goal ~${weeksToGoal} weeks in!`;
      }
    } else {
      projection = `\n\n📊 At $${amount}/${frequency}, you'll reach $${targetAmount.toLocaleString()} in ~${weeksToGoal} weeks.`;
    }

    context.state = 'awaiting_yield_optimization';

    return {
      message: `Got it, $${amount} ${frequency} contributions.${projection}`,
      options: [
        { label: 'Yes, optimize my savings', value: 'yes' },
        { label: 'No, just track progress', value: 'no' },
      ],
      complete: false,
    };
  }

  private handleAwaitingYieldOptimization(
    context: ConversationContext,
    input: string
  ): BuilderResponse {
    if (input.includes('yes') || input.includes('optimize')) {
      context.data.enableYieldOptimization = true;
      context.state = 'awaiting_risk_tolerance';

      return {
        message: "What's your risk tolerance for the yield strategies?",
        options: [
          {
            label: 'Conservative',
            value: 'conservative',
            description: 'Staking only, ~5-8% APY',
          },
          {
            label: 'Moderate',
            value: 'moderate',
            description: 'Staking + Lending, ~8-15% APY',
          },
          {
            label: 'Aggressive',
            value: 'aggressive',
            description: 'Include LP positions, ~15-30% APY',
          },
        ],
        complete: false,
      };
    }

    context.data.enableYieldOptimization = false;
    return this.finalizeGoalStrategy(context);
  }

  private handleAwaitingRiskTolerance(
    context: ConversationContext,
    input: string
  ): BuilderResponse {
    let riskTolerance: RiskTolerance;

    if (input.includes('conservative') || input.includes('low')) {
      riskTolerance = 'conservative';
    } else if (input.includes('aggressive') || input.includes('high')) {
      riskTolerance = 'aggressive';
    } else {
      riskTolerance = 'moderate';
    }

    context.data.riskTolerance = riskTolerance;
    context.data.yieldStrategy = this.createYieldStrategy(riskTolerance);

    return this.finalizeGoalStrategy(context);
  }

  private createYieldStrategy(riskTolerance: RiskTolerance): YieldHarvesterStrategy {
    const protocols: YieldProtocol[] = [
      {
        protocolId: 'marinade',
        protocolName: 'Marinade Finance',
        productType: 'liquid_staking',
        maxAllocation: riskTolerance === 'conservative' ? 100 : 50,
        enabled: true,
        chain: 'solana',
      },
    ];

    if (riskTolerance !== 'conservative') {
      protocols.push({
        protocolId: 'kamino',
        protocolName: 'Kamino Finance',
        productType: 'lending',
        maxAllocation: 50,
        enabled: true,
        chain: 'solana',
      });
    }

    return {
      type: 'yield_harvester',
      protocols,
      minAPY: riskTolerance === 'aggressive' ? 8 : 5,
      maxProtocolExposure: riskTolerance === 'conservative' ? 100 : 50,
      autoCompound: true,
      harvestFrequency: 'weekly',
      rebalanceThreshold: 10,
      includeLiquidityPools: riskTolerance === 'aggressive',
    };
  }

  private finalizeGoalStrategy(context: ConversationContext): BuilderResponse {
    const {
      targetAmount,
      deadline,
      contributionAmount,
      contributionFrequency,
      enableYieldOptimization,
      riskTolerance,
      yieldStrategy,
    } = context.data;

    let summary = `Here's your savings goal:\n\n`;
    summary += `🎯 Target: $${targetAmount?.toLocaleString()}\n`;

    if (deadline) {
      summary += `📅 Deadline: ${new Date(deadline).toLocaleDateString()}\n`;
    }

    summary += `💰 Contributions: $${contributionAmount} ${contributionFrequency}\n`;

    if (enableYieldOptimization && yieldStrategy) {
      summary += `\n🌾 Yield Strategy: ${this.capitalizeFirst(riskTolerance || 'moderate')}\n`;

      for (const protocol of yieldStrategy.protocols) {
        const apyRange =
          protocol.protocolId === 'marinade' ? '~7% APY' : '~12% APY';
        summary += `   • ${protocol.protocolName} (${apyRange})\n`;
      }

      summary += `   • Auto-compound: ${yieldStrategy.autoCompound ? 'Yes' : 'No'}\n`;
      summary += `   • Rebalance threshold: ${yieldStrategy.rebalanceThreshold}%\n`;
    }

    // Calculate projected outcome
    const weeklyContribution = this.toWeeklyAmount(
      contributionAmount || 0,
      contributionFrequency || 'weekly'
    );

    if (deadline) {
      const weeksToDeadline = Math.ceil((deadline - Date.now()) / (7 * 24 * 60 * 60 * 1000));
      const contributionTotal = weeklyContribution * weeksToDeadline;
      const estimatedYield = enableYieldOptimization
        ? contributionTotal * (riskTolerance === 'aggressive' ? 0.15 : riskTolerance === 'moderate' ? 0.1 : 0.06)
        : 0;
      const projectedTotal = contributionTotal + estimatedYield;

      summary += `\n📊 Projected outcome:\n`;
      summary += `   • Contributions: $${contributionTotal.toLocaleString()}\n`;
      if (estimatedYield > 0) {
        summary += `   • Estimated yield: ~$${Math.round(estimatedYield).toLocaleString()}\n`;
      }
      summary += `   • Total: ~$${Math.round(projectedTotal).toLocaleString()}\n`;
    }

    summary += '\n\nReady to activate this goal?';

    context.state = 'awaiting_confirmation';
    return {
      message: summary,
      options: [
        { label: 'Confirm & Activate', value: 'confirm' },
        { label: 'Edit', value: 'edit' },
        { label: 'Cancel', value: 'cancel' },
      ],
      complete: false,
    };
  }

  // ==========================================================================
  // Confirmation
  // ==========================================================================

  private async handleAwaitingConfirmation(
    context: ConversationContext,
    input: string
  ): Promise<BuilderResponse> {
    if (input.includes('confirm') || input.includes('yes') || input.includes('activate')) {
      const strategy = await this.createStrategy(context);

      if (!strategy) {
        return {
          message: 'Failed to create strategy. Please try again.',
          complete: false,
          error: 'STRATEGY_CREATION_FAILED',
        };
      }

      context.state = 'completed';
      return {
        message: `✅ Strategy "${strategy.name}" created and activated!\n\nStrategy ID: ${strategy.strategyId}\n\nI'll start executing according to your settings. You can check status anytime by asking "show my strategies".`,
        strategy,
        complete: true,
      };
    }

    if (input.includes('edit') || input.includes('change')) {
      // Reset to appropriate state based on strategy type
      context.state = 'idle';
      return {
        message: 'What would you like to change?',
        complete: false,
      };
    }

    if (input.includes('cancel') || input.includes('no')) {
      context.state = 'cancelled';
      return {
        message: 'Strategy creation cancelled. Let me know if you want to start over.',
        complete: true,
      };
    }

    return {
      message: 'Please confirm, edit, or cancel.',
      options: [
        { label: 'Confirm & Activate', value: 'confirm' },
        { label: 'Edit', value: 'edit' },
        { label: 'Cancel', value: 'cancel' },
      ],
      complete: false,
    };
  }

  // ==========================================================================
  // Strategy Creation
  // ==========================================================================

  private async createStrategy(context: ConversationContext): Promise<Strategy | null> {
    const { userId, strategyType, data } = context;

    try {
      let strategy: Strategy;

      switch (strategyType) {
        case 'dca':
          strategy = await this.createDCAStrategy(userId, data);
          break;
        case 'stop_loss':
          strategy = await this.createStopLossStrategy(userId, data);
          break;
        case 'take_profit':
          strategy = await this.createTakeProfitStrategy(userId, data);
          break;
        case 'goal':
          strategy = await this.createGoalStrategyEntity(userId, data);
          break;
        default:
          return null;
      }

      return strategy;
    } catch (error) {
      console.error('[StrategyBuilder] Failed to create strategy:', error);
      return null;
    }
  }

  private async createDCAStrategy(userId: string, data: BuilderData): Promise<Strategy> {
    // Map 'biweekly' to 'weekly' since DCAConfig doesn't support biweekly
    const dcaFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly' =
      data.frequency === 'biweekly' ? 'weekly' : (data.frequency || 'weekly');

    const config: DCAConfig = {
      tokenPair: {
        from: data.fromToken || 'USDC',
        to: data.toToken || 'SOL',
      },
      amountPerExecution: data.amountPerExecution || 50,
      frequency: dcaFrequency,
      slippageTolerance: this.config.defaultSlippageTolerance,
      maxTotalAmount: data.maxTotalAmount,
      maxExecutions: data.maxExecutions,
    };

    const strategyInput = {
      userId,
      type: 'dca' as const,
      name: `DCA ${config.tokenPair.to} - $${config.amountPerExecution} ${config.frequency}`,
      config,
    };

    return this.store.create(strategyInput);
  }

  private async createStopLossStrategy(userId: string, data: BuilderData): Promise<Strategy> {
    const config: StopLossConfig = {
      token: data.token || 'SOL',
      triggerPrice: data.triggerPrice || 0,
      quoteCurrency: 'USD',
      triggerType: 'below',
      amountToSell: data.amountToSell || 'all',
      amount: data.sellAmount || 100,
      slippageTolerance: this.config.defaultSlippageTolerance,
    };

    const strategyInput = {
      userId,
      type: 'stop_loss' as const,
      name: `Stop-Loss ${config.token} @ $${config.triggerPrice}`,
      config,
    };

    return this.store.create(strategyInput);
  }

  private async createTakeProfitStrategy(userId: string, data: BuilderData): Promise<Strategy> {
    const config: TakeProfitConfig = {
      token: data.token || 'SOL',
      triggerPrice: data.triggerPrice || 0,
      quoteCurrency: 'USD',
      amountToSell: data.amountToSell || 'all',
      amount: data.sellAmount || 100,
      slippageTolerance: this.config.defaultSlippageTolerance,
    };

    const strategyInput = {
      userId,
      type: 'take_profit' as const,
      name: `Take-Profit ${config.token} @ $${config.triggerPrice}`,
      config,
    };

    return this.store.create(strategyInput);
  }

  private async createGoalStrategyEntity(userId: string, data: BuilderData): Promise<Strategy> {
    let achievementStrategy: GoalStrategy;

    if (data.enableYieldOptimization && data.yieldStrategy) {
      achievementStrategy = data.yieldStrategy;
    } else {
      // Default to DCA strategy
      achievementStrategy = {
        type: 'dca',
        dcaConfig: {
          tokenPair: { from: 'USDC', to: 'USDC' },
          amountPerExecution: data.contributionAmount || 100,
          frequency: data.contributionFrequency || 'weekly',
          slippageTolerance: this.config.defaultSlippageTolerance,
        },
      } as DCAGoalStrategy;
    }

    const config: GoalConfig = {
      goalType: data.goalType || 'save',
      targetAmount: data.targetAmount || 0,
      targetToken: data.targetToken || 'USDC',
      deadline: data.deadline,
      riskTolerance: data.riskTolerance || 'moderate',
      achievementStrategy,
      contribution: data.contributionAmount
        ? {
            amount: data.contributionAmount,
            frequency: data.contributionFrequency || 'weekly',
            sourceToken: 'USDC',
          }
        : undefined,
    };

    const strategyInput = {
      userId,
      type: 'goal' as const,
      name: `Save $${config.targetAmount.toLocaleString()}${config.deadline ? ` by ${new Date(config.deadline).toLocaleDateString()}` : ''}`,
      config: config as unknown as Strategy['config'],
    };

    return this.store.create(strategyInput);
  }

  // ==========================================================================
  // Intent Detection
  // ==========================================================================

  private matchesDCAIntent(input: string): boolean {
    return (
      /\b(dca|dollar.cost|average)\b/i.test(input) ||
      /\bbuy\s+\$?\d+.*every\s+(day|week|month)/i.test(input) ||
      /\bregular(ly)?\s+buy/i.test(input)
    );
  }

  private matchesStopLossIntent(input: string): boolean {
    return (
      /\bstop.?loss\b/i.test(input) ||
      /\bsell\s+(if|when).*drops?\b/i.test(input) ||
      /\bsell\s+(if|when).*falls?\b/i.test(input) ||
      /\bsell\s+(if|when).*below\b/i.test(input)
    );
  }

  private matchesTakeProfitIntent(input: string): boolean {
    return (
      /\btake.?profit\b/i.test(input) ||
      /\bsell\s+(if|when).*hits?\b/i.test(input) ||
      /\bsell\s+(if|when).*reaches?\b/i.test(input) ||
      /\bsell\s+(if|when).*above\b/i.test(input)
    );
  }

  private matchesGoalIntent(input: string): boolean {
    return (
      /\b(help\s+me\s+)?save\s+\$?\d/i.test(input) ||
      /\bgoal\s+to\s+(save|accumulate)/i.test(input) ||
      /\bsavings?\s+goal/i.test(input) ||
      /\bwant\s+to\s+save/i.test(input)
    );
  }

  // ==========================================================================
  // Extraction Helpers
  // ==========================================================================

  private extractToken(input: string): string | null {
    const upperInput = input.toUpperCase();
    for (const token of this.config.supportedTokens) {
      if (upperInput.includes(token)) {
        return token;
      }
    }
    return null;
  }

  private extractAmount(input: string): number | null {
    // Match patterns like $50, 50, 50.00, $50.00
    const match = input.match(/\$?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
    return null;
  }

  private extractPrice(input: string): number | null {
    // Match patterns like $100, @100, at 100
    const match = input.match(/(?:\$|@|at\s+)\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
    return this.extractAmount(input);
  }

  private extractFrequency(
    input: string
  ): 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | null {
    const lower = input.toLowerCase();
    if (lower.includes('hour')) return 'hourly';
    if (lower.includes('daily') || lower.includes('day')) return 'daily';
    if (lower.includes('biweekly') || lower.includes('bi-weekly')) return 'biweekly';
    if (lower.includes('weekly') || lower.includes('week')) return 'weekly';
    if (lower.includes('monthly') || lower.includes('month')) return 'monthly';
    return null;
  }

  // ==========================================================================
  // Utility Helpers
  // ==========================================================================

  private frequencyMultiplier(frequency: string): number {
    switch (frequency) {
      case 'hourly':
        return 168; // per week
      case 'daily':
        return 7;
      case 'weekly':
        return 1;
      case 'biweekly':
        return 0.5;
      case 'monthly':
        return 0.25;
      default:
        return 1;
    }
  }

  private toWeeklyAmount(amount: number, frequency: string): number {
    return amount * this.frequencyMultiplier(frequency);
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let builderInstance: StrategyBuilder | null = null;

export function getStrategyBuilder(
  store: StrategyStore,
  config?: Partial<StrategyBuilderConfig>
): StrategyBuilder {
  if (!builderInstance) {
    builderInstance = new StrategyBuilder(store, config);
  }
  return builderInstance;
}

export function resetStrategyBuilder(): void {
  builderInstance = null;
}
