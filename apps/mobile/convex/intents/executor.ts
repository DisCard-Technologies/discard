/**
 * Intent Executor Module
 *
 * Builds and submits Solana transactions based on parsed intents.
 * Integrates with the TextPay User Smart Wallet program.
 *
 * TextPay Program: 5XQH3sSdahXTgkyhVnHFm48Rz7nDZj4HEjkSojx5QBJU
 * Features:
 * - Phone-hash derived PDAs for self-custodial wallets
 * - PIN-protected transfers
 * - Micro-swaps under $1
 * - Session keys for DEX interactions
 */
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// Solana configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const TEXTPAY_PROGRAM_ID = "5XQH3sSdahXTgkyhVnHFm48Rz7nDZj4HEjkSojx5QBJU";

// Transaction types
interface TransactionInstruction {
  programId: string;
  keys: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string; // Base64 encoded
}

interface UnsignedTransaction {
  instructions: TransactionInstruction[];
  recentBlockhash: string;
  feePayer: string;
  requiresSignature: boolean;
}

// ============ INTERNAL ACTIONS ============

/**
 * Execute an approved intent
 */
export const execute = internalAction({
  args: {
    intentId: v.id("intents"),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      // Update status to executing
      await ctx.runMutation(internal.intents.intents.updateStatus, {
        intentId: args.intentId,
        status: "executing",
      });

      // Get intent details
      const intent = await ctx.runQuery(internal.intents.intents.getById, {
        intentId: args.intentId,
      });

      if (!intent) {
        throw new Error("Intent not found");
      }

      if (intent.status !== "approved" && intent.status !== "executing") {
        throw new Error(`Cannot execute intent in ${intent.status} state`);
      }

      if (!intent.parsedIntent) {
        throw new Error("Intent has no parsed action");
      }

      // Build transaction based on action type
      let transaction: UnsignedTransaction;

      switch (intent.parsedIntent.action) {
        case "fund_card":
          transaction = await buildFundCardTransaction(ctx, intent);
          break;

        case "create_card":
          await executeCreateCard(ctx, intent);
          // Card creation doesn't need blockchain transaction
          await ctx.runMutation(internal.intents.intents.updateStatus, {
            intentId: args.intentId,
            status: "completed",
          });
          return;

        case "freeze_card":
          await executeFreezeCard(ctx, intent);
          await ctx.runMutation(internal.intents.intents.updateStatus, {
            intentId: args.intentId,
            status: "completed",
          });
          return;

        case "transfer":
          transaction = await buildTransferTransaction(ctx, intent);
          break;

        case "withdraw_defi":
          transaction = await buildDefiWithdrawalTransaction(ctx, intent);
          break;

        case "swap":
          transaction = await buildSwapTransaction(ctx, intent);
          break;

        case "pay_bill":
          transaction = await buildPayBillTransaction(ctx, intent);
          break;

        default:
          throw new Error(`Unknown action: ${intent.parsedIntent.action}`);
      }

      // Store transaction instructions for client to sign
      await ctx.runMutation(internal.intents.intents.updateStatus, {
        intentId: args.intentId,
        status: "executing",
        solanaInstructions: transaction.instructions,
      });

      // Note: In a real implementation, the client would:
      // 1. Receive the unsigned transaction
      // 2. Sign it with the user's passkey
      // 3. Call submitSignedTransaction to broadcast

      // For now, we'll simulate success for non-blockchain actions
      if (!transaction.requiresSignature) {
        await ctx.runMutation(internal.intents.intents.updateStatus, {
          intentId: args.intentId,
          status: "completed",
          solanaTransactionSignature: "simulated_" + Date.now(),
        });
      }

    } catch (error) {
      console.error("Intent execution failed:", error);
      await ctx.runMutation(internal.intents.intents.updateStatus, {
        intentId: args.intentId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown execution error",
        errorCode: "EXECUTION_ERROR",
      });
    }
  },
});

/**
 * Submit a signed transaction
 */
export const submitSignedTransaction = internalAction({
  args: {
    intentId: v.id("intents"),
    signedTransaction: v.string(), // Base64 encoded signed transaction
  },
  handler: async (ctx, args): Promise<{ signature: string }> => {
    const intent = await ctx.runQuery(internal.intents.intents.getById, {
      intentId: args.intentId,
    });

    if (!intent) {
      throw new Error("Intent not found");
    }

    if (intent.status !== "executing") {
      throw new Error("Intent is not in executing state");
    }

    // Submit to Solana
    const signature = await submitToSolana(args.signedTransaction);

    // Update intent with signature
    await ctx.runMutation(internal.intents.intents.updateStatus, {
      intentId: args.intentId,
      status: "completed",
      solanaTransactionSignature: signature,
    });

    return { signature };
  },
});

// ============ TRANSACTION BUILDERS ============

/**
 * Build transaction to fund a card from wallet
 */
async function buildFundCardTransaction(
  ctx: any,
  intent: any
): Promise<UnsignedTransaction> {
  const { parsedIntent } = intent;

  if (!parsedIntent.amount) {
    throw new Error("Amount required for fund_card");
  }

  if (!parsedIntent.targetId) {
    throw new Error("Target card required for fund_card");
  }

  // Get recent blockhash
  const blockhash = await getRecentBlockhash();

  // Build instruction for TextPay transfer
  // This would use the TextPay program's transfer instruction

  const instruction: TransactionInstruction = {
    programId: TEXTPAY_PROGRAM_ID,
    keys: [
      // Source wallet (user's PDA)
      {
        pubkey: "placeholder_source_wallet",
        isSigner: true,
        isWritable: true,
      },
      // Destination (card funding account)
      {
        pubkey: "placeholder_destination",
        isSigner: false,
        isWritable: true,
      },
      // System program
      {
        pubkey: "11111111111111111111111111111111",
        isSigner: false,
        isWritable: false,
      },
    ],
    data: encodeTransferInstruction(parsedIntent.amount),
  };

  return {
    instructions: [instruction],
    recentBlockhash: blockhash,
    feePayer: "placeholder_fee_payer",
    requiresSignature: true,
  };
}

/**
 * Build transaction for wallet-to-wallet transfer
 */
async function buildTransferTransaction(
  ctx: any,
  intent: any
): Promise<UnsignedTransaction> {
  const { parsedIntent } = intent;

  if (!parsedIntent.amount) {
    throw new Error("Amount required for transfer");
  }

  const blockhash = await getRecentBlockhash();

  const instruction: TransactionInstruction = {
    programId: TEXTPAY_PROGRAM_ID,
    keys: [
      {
        pubkey: "placeholder_source",
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: parsedIntent.targetId || "placeholder_destination",
        isSigner: false,
        isWritable: true,
      },
    ],
    data: encodeTransferInstruction(parsedIntent.amount),
  };

  return {
    instructions: [instruction],
    recentBlockhash: blockhash,
    feePayer: "placeholder_fee_payer",
    requiresSignature: true,
  };
}

/**
 * Build transaction to withdraw from DeFi position
 */
async function buildDefiWithdrawalTransaction(
  ctx: any,
  intent: any
): Promise<UnsignedTransaction> {
  const { parsedIntent } = intent;

  if (!parsedIntent.sourceId) {
    throw new Error("DeFi position ID required");
  }

  const blockhash = await getRecentBlockhash();

  // DeFi withdrawal would involve:
  // 1. Withdraw from lending protocol
  // 2. Swap to USDC if needed
  // 3. Transfer to card funding account

  // This is a simplified placeholder
  const instruction: TransactionInstruction = {
    programId: TEXTPAY_PROGRAM_ID,
    keys: [
      {
        pubkey: "placeholder_defi_position",
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: "placeholder_user_wallet",
        isSigner: true,
        isWritable: true,
      },
    ],
    data: encodeWithdrawInstruction(parsedIntent.amount || 0),
  };

  return {
    instructions: [instruction],
    recentBlockhash: blockhash,
    feePayer: "placeholder_fee_payer",
    requiresSignature: true,
  };
}

/**
 * Build swap transaction
 */
async function buildSwapTransaction(
  ctx: any,
  intent: any
): Promise<UnsignedTransaction> {
  const { parsedIntent } = intent;

  if (!parsedIntent.amount) {
    throw new Error("Amount required for swap");
  }

  const blockhash = await getRecentBlockhash();

  // Swap would use Jupiter or Raydium
  // For micro-swaps under $1, TextPay has on-chain PIN verification

  const instruction: TransactionInstruction = {
    programId: TEXTPAY_PROGRAM_ID,
    keys: [
      {
        pubkey: "placeholder_user_wallet",
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: "placeholder_swap_pool",
        isSigner: false,
        isWritable: true,
      },
    ],
    data: encodeSwapInstruction(parsedIntent.amount, parsedIntent.currency || "USDC"),
  };

  return {
    instructions: [instruction],
    recentBlockhash: blockhash,
    feePayer: "placeholder_fee_payer",
    requiresSignature: true,
  };
}

/**
 * Build pay bill transaction
 */
async function buildPayBillTransaction(
  ctx: any,
  intent: any
): Promise<UnsignedTransaction> {
  const { parsedIntent } = intent;

  if (!parsedIntent.amount) {
    throw new Error("Amount required for pay_bill");
  }

  const blockhash = await getRecentBlockhash();

  // Pay bill would transfer to an external recipient
  const instruction: TransactionInstruction = {
    programId: TEXTPAY_PROGRAM_ID,
    keys: [
      {
        pubkey: "placeholder_user_wallet",
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: parsedIntent.metadata?.recipientAddress || "placeholder_recipient",
        isSigner: false,
        isWritable: true,
      },
    ],
    data: encodeTransferInstruction(parsedIntent.amount),
  };

  return {
    instructions: [instruction],
    recentBlockhash: blockhash,
    feePayer: "placeholder_fee_payer",
    requiresSignature: true,
  };
}

// ============ NON-BLOCKCHAIN EXECUTORS ============

/**
 * Execute card creation (no blockchain needed)
 */
async function executeCreateCard(ctx: any, intent: any): Promise<void> {
  const { parsedIntent } = intent;

  // Create card via Convex mutation
  await ctx.runMutation(internal.cards.cards.create, {
    spendingLimit: parsedIntent.metadata?.spendingLimit,
    nickname: parsedIntent.metadata?.nickname,
  });
}

/**
 * Execute card freeze (no blockchain needed)
 */
async function executeFreezeCard(ctx: any, intent: any): Promise<void> {
  const { parsedIntent } = intent;

  if (!parsedIntent.targetId) {
    throw new Error("Card ID required to freeze");
  }

  await ctx.runMutation(internal.cards.cards.freeze, {
    cardId: parsedIntent.targetId as Id<"cards">,
    reason: "User requested via intent",
  });
}

// ============ HELPER FUNCTIONS ============

/**
 * Get recent blockhash from Solana
 */
async function getRecentBlockhash(): Promise<string> {
  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLatestBlockhash",
        params: [{ commitment: "finalized" }],
      }),
    });

    const result = await response.json();
    return result.result?.value?.blockhash ?? "placeholder_blockhash";
  } catch (error) {
    console.error("Failed to get blockhash:", error);
    return "placeholder_blockhash";
  }
}

/**
 * Submit signed transaction to Solana
 */
async function submitToSolana(signedTransaction: string): Promise<string> {
  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [signedTransaction, { encoding: "base64" }],
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.result;
  } catch (error) {
    console.error("Failed to submit transaction:", error);
    throw error;
  }
}

/**
 * Encode transfer instruction data
 */
function encodeTransferInstruction(amount: number): string {
  // In production, this would use Borsh serialization
  // For TextPay program's transfer instruction format
  const buffer = new ArrayBuffer(9);
  const view = new DataView(buffer);

  // Instruction discriminator for transfer (placeholder)
  view.setUint8(0, 1); // transfer = 1

  // Amount as u64 (little endian)
  // JavaScript can't handle u64 natively, so we split it
  view.setUint32(1, amount & 0xffffffff, true);
  view.setUint32(5, Math.floor(amount / 0x100000000), true);

  return Buffer.from(buffer).toString("base64");
}

/**
 * Encode withdraw instruction data
 */
function encodeWithdrawInstruction(amount: number): string {
  const buffer = new ArrayBuffer(9);
  const view = new DataView(buffer);

  // Instruction discriminator for withdraw
  view.setUint8(0, 2); // withdraw = 2

  view.setUint32(1, amount & 0xffffffff, true);
  view.setUint32(5, Math.floor(amount / 0x100000000), true);

  return Buffer.from(buffer).toString("base64");
}

/**
 * Encode swap instruction data
 */
function encodeSwapInstruction(amount: number, targetCurrency: string): string {
  const buffer = new ArrayBuffer(13);
  const view = new DataView(buffer);

  // Instruction discriminator for swap
  view.setUint8(0, 3); // swap = 3

  view.setUint32(1, amount & 0xffffffff, true);
  view.setUint32(5, Math.floor(amount / 0x100000000), true);

  // Target currency as 4 bytes (truncated/padded)
  const currencyBytes = new TextEncoder().encode(targetCurrency.slice(0, 4).padEnd(4, "\0"));
  new Uint8Array(buffer, 9, 4).set(currencyBytes);

  return Buffer.from(buffer).toString("base64");
}
