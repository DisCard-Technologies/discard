/**
 * Intent Executor Module
 *
 * Builds and submits Solana transactions based on parsed intents.
 * Integrates with Turnkey TEE for secure signing and optimistic settlement.
 *
 * TextPay Program: 5XQH3sSdahXTgkyhVnHFm48Rz7nDZj4HEjkSojx5QBJU
 * Features:
 * - Phone-hash derived PDAs for self-custodial wallets
 * - PIN-protected transfers
 * - Micro-swaps under $1
 * - Session keys for DEX interactions
 * - Turnkey TEE signing (AWS Nitro Enclaves)
 * - Optimistic updates with 150ms Alpenglow target
 */
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// Solana configuration - Firedancer-optimized endpoints preferred
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const HELIUS_FIREDANCER_URL = process.env.HELIUS_RPC_URL; // Firedancer-optimized
const TEXTPAY_PROGRAM_ID = "5XQH3sSdahXTgkyhVnHFm48Rz7nDZj4HEjkSojx5QBJU";

// Jupiter configuration
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

// Alpenglow confirmation targets
const ALPENGLOW_TARGET_MS = 150;
const MAX_CONFIRMATION_WAIT_MS = 30000;

// Turnkey configuration
const TURNKEY_API_BASE = "https://api.turnkey.com";
const TURNKEY_ORGANIZATION_ID = process.env.TURNKEY_ORGANIZATION_ID;

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

// Optimistic settlement types
interface OptimisticSettlement {
  settlementId: string;
  intentId: string;
  status: "pending" | "submitted" | "confirmed" | "finalized" | "failed" | "rolled_back";
  optimisticValue: number;
  confirmedValue?: number;
  confirmationTimeMs?: number;
  isWithinTarget: boolean;
}

// Turnkey signing types
interface TurnkeySignRequest {
  subOrganizationId: string;
  walletId: string;
  transaction: string; // Base64 encoded
  activityType: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD";
}

interface TurnkeySignResponse {
  activityId: string;
  signature: string;
  status: "COMPLETED" | "PENDING" | "FAILED";
}

// ============ INTERNAL ACTIONS ============

/**
 * Execute an approved intent with optimistic settlement
 *
 * Flow:
 * 1. Apply optimistic update immediately (UI sees instant change)
 * 2. Build Solana transaction
 * 3. Request Turnkey TEE signing
 * 4. Submit to Firedancer-optimized RPC
 * 5. Track confirmation (target: 150ms Alpenglow)
 * 6. Finalize or rollback based on result
 */
export const execute = internalAction({
  args: {
    intentId: v.id("intents"),
  },
  handler: async (ctx, args): Promise<void> => {
    const startTime = Date.now();

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

      // ============ STEP 1: Apply Optimistic Update ============
      // For balance-affecting operations, update UI immediately
      let settlementId: string | null = null;

      if (intent.parsedIntent.action === "fund_card" && intent.parsedIntent.amount) {
        // Create optimistic settlement record
        const settlement = await ctx.runMutation(
          internal.realtime.optimistic.optimisticBalanceUpdate,
          {
            userId: intent.userId,
            cardId: intent.parsedIntent.targetId as Id<"cards">,
            amount: intent.parsedIntent.amount,
            operation: "add",
          }
        );
        settlementId = settlement.settlementId;
      } else if (intent.parsedIntent.action === "transfer" && intent.parsedIntent.amount) {
        // For transfers, deduct from source optimistically
        const settlement = await ctx.runMutation(
          internal.realtime.optimistic.optimisticBalanceUpdate,
          {
            userId: intent.userId,
            cardId: intent.parsedIntent.sourceId as Id<"cards">,
            amount: intent.parsedIntent.amount,
            operation: "subtract",
          }
        );
        settlementId = settlement.settlementId;
      }

      // ============ STEP 2: Build Transaction ============
      let transaction: UnsignedTransaction;

      switch (intent.parsedIntent.action) {
        case "fund_card":
          transaction = await buildFundCardTransaction(ctx, intent);
          break;

        case "create_card":
          await executeCreateCard(ctx, intent);
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

        case "delete_card":
          await executeDeleteCard(ctx, intent);
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

        case "merchant_payment":
          transaction = await buildMerchantPaymentTransaction(ctx, intent);
          break;

        default:
          throw new Error(`Unknown action: ${intent.parsedIntent.action}`);
      }

      // ============ STEP 3: Sign with Turnkey TEE ============
      let signedTransaction: string;

      if (transaction.requiresSignature) {
        // Get user's Turnkey sub-organization
        const turnkeyOrg = await ctx.runQuery(
          internal.tee.turnkey.getByUserId,
          { userId: intent.userId }
        );

        if (turnkeyOrg) {
          // Request signature from Turnkey TEE
          signedTransaction = await requestTurnkeySignature(
            turnkeyOrg.subOrganizationId,
            turnkeyOrg.walletAddress,
            serializeTransaction(transaction)
          );
        } else {
          // Fallback: store for client-side signing
          await ctx.runMutation(internal.intents.intents.updateStatus, {
            intentId: args.intentId,
            status: "executing",
            solanaInstructions: transaction.instructions,
          });
          return;
        }
      } else {
        signedTransaction = serializeTransaction(transaction);
      }

      // ============ STEP 4: Submit to Firedancer RPC ============
      const submitStartTime = Date.now();
      const signature = await submitToFiredancerRPC(signedTransaction);

      // ============ STEP 5: Track Confirmation ============
      const confirmationResult = await waitForConfirmation(signature, submitStartTime);

      const totalTimeMs = Date.now() - startTime;
      const isWithinTarget = totalTimeMs <= ALPENGLOW_TARGET_MS;

      // ============ STEP 6: Finalize or Rollback ============
      if (confirmationResult.confirmed) {
        // Finalize the optimistic update
        if (settlementId) {
          await ctx.runMutation(internal.realtime.optimistic.confirmSettlement, {
            settlementId: settlementId as Id<"optimisticSettlements">,
            signature,
            confirmationTimeMs: confirmationResult.timeMs,
          });
        }

        await ctx.runMutation(internal.intents.intents.updateStatus, {
          intentId: args.intentId,
          status: "completed",
          solanaTransactionSignature: signature,
        });

        console.log(
          `[Executor] Intent ${args.intentId} completed in ${totalTimeMs}ms ` +
          `(target: ${ALPENGLOW_TARGET_MS}ms, within: ${isWithinTarget})`
        );
      } else {
        // Rollback the optimistic update
        if (settlementId) {
          await ctx.runMutation(internal.realtime.optimistic.rollbackSettlement, {
            settlementId: settlementId as Id<"optimisticSettlements">,
            reason: confirmationResult.error || "Confirmation failed",
          });
        }

        throw new Error(confirmationResult.error || "Transaction confirmation failed");
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

  if (!JUPITER_API_KEY) {
    throw new Error("JUPITER_API_KEY environment variable not set");
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

/**
 * Build merchant payment transaction (cross-currency via Jupiter)
 *
 * Uses Jupiter's atomic swap-to-destination feature where the output
 * goes directly to the merchant's wallet in their settlement currency.
 *
 * Flow:
 * 1. User pays in any stablecoin they hold
 * 2. Jupiter swaps to merchant's settlement currency
 * 3. Output goes directly to merchant (atomic)
 * 4. Merchant receives settlement amount minus platform fee
 */
async function buildMerchantPaymentTransaction(
  ctx: any,
  intent: any
): Promise<UnsignedTransaction> {
  const { parsedIntent } = intent;
  const metadata = parsedIntent.metadata || {};

  if (!parsedIntent.amount) {
    throw new Error("Amount required for merchant_payment");
  }

  if (!metadata.merchantAddress) {
    throw new Error("Merchant address required for merchant_payment");
  }

  if (!metadata.settlementMint) {
    throw new Error("Settlement token mint required for merchant_payment");
  }

  const blockhash = await getRecentBlockhash();

  // For cross-currency payments, we use Jupiter's swap API
  // with destinationTokenAccount set to merchant's ATA
  // This is built by the merchantPayment.buildMerchantPaymentTransaction action
  // which returns a base64-encoded transaction ready for signing

  // If source and settlement are the same, it's a direct transfer
  const isSameCurrency = metadata.sourceMint === metadata.settlementMint;

  if (isSameCurrency) {
    // Direct SPL token transfer (no swap needed)
    const instruction: TransactionInstruction = {
      programId: TEXTPAY_PROGRAM_ID,
      keys: [
        {
          pubkey: "placeholder_user_token_account",
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: metadata.merchantTokenAccount || "placeholder_merchant_ata",
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: "placeholder_user_wallet",
          isSigner: true,
          isWritable: false,
        },
        // Token program
        {
          pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
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

  // For cross-currency, Jupiter handles the swap transaction
  // The transaction would be pre-built by the merchantPayment action
  // and passed in metadata.jupiterSwapTransaction

  if (metadata.jupiterSwapTransaction) {
    // Return the Jupiter-built swap transaction
    // This is already a complete transaction with all instructions
    return {
      instructions: [], // Instructions are embedded in Jupiter's transaction
      recentBlockhash: blockhash,
      feePayer: "placeholder_fee_payer",
      requiresSignature: true,
    };
  }

  // Fallback: Build instruction that triggers Jupiter swap
  // In practice, the frontend would call merchantPayment.buildMerchantPaymentTransaction
  // before creating the intent with the full transaction
  const instruction: TransactionInstruction = {
    programId: TEXTPAY_PROGRAM_ID,
    keys: [
      {
        pubkey: "placeholder_user_wallet",
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: metadata.merchantAddress,
        isSigner: false,
        isWritable: true,
      },
      // Jupiter program
      {
        pubkey: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
        isSigner: false,
        isWritable: false,
      },
    ],
    data: encodeMerchantPaymentInstruction(
      parsedIntent.amount,
      metadata.settlementAmount,
      metadata.sourceMint,
      metadata.settlementMint
    ),
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

  // Create card via Convex mutation - pass userId for internal auth
  await ctx.runMutation(internal.cards.cards.create, {
    spendingLimit: parsedIntent.metadata?.spendingLimit,
    nickname: parsedIntent.metadata?.nickname,
    userId: intent.userId,
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

/**
 * Execute card deletion (terminates in Marqeta and marks as deleted)
 */
async function executeDeleteCard(ctx: any, intent: any): Promise<void> {
  const { parsedIntent } = intent;

  // Handle multiple card deletions via metadata
  const cardIds = parsedIntent.metadata?.cardIds as string[] | undefined;

  console.log("[Executor] executeDeleteCard called");
  console.log("[Executor] cardIds from metadata:", cardIds);
  console.log("[Executor] targetId:", parsedIntent.targetId);

  if (cardIds && cardIds.length > 0) {
    // Delete multiple cards
    console.log(`[Executor] Deleting ${cardIds.length} cards`);
    for (const cardId of cardIds) {
      console.log(`[Executor] Deleting card: ${cardId}`);
      await ctx.runMutation(internal.cards.cards.deleteCardInternal, {
        cardId: cardId as Id<"cards">,
        userId: intent.userId,
      });
    }
  } else if (parsedIntent.targetId) {
    // Delete single card
    console.log(`[Executor] Deleting single card: ${parsedIntent.targetId}`);
    await ctx.runMutation(internal.cards.cards.deleteCardInternal, {
      cardId: parsedIntent.targetId as Id<"cards">,
      userId: intent.userId,
    });
  } else {
    throw new Error("Card ID(s) required to delete. AI must specify targetId or metadata.cardIds");
  }
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

/**
 * Encode merchant payment instruction data
 * For cross-currency payments via Jupiter atomic swap
 */
function encodeMerchantPaymentInstruction(
  sourceAmount: number,
  settlementAmount: number,
  sourceMint: string,
  settlementMint: string
): string {
  // In production, this would encode the Jupiter swap parameters
  // For now, we use a simplified format for TextPay's merchant payment instruction
  const buffer = new ArrayBuffer(25);
  const view = new DataView(buffer);

  // Instruction discriminator for merchant_payment
  view.setUint8(0, 5); // merchant_payment = 5

  // Source amount as u64 (little endian)
  view.setUint32(1, sourceAmount & 0xffffffff, true);
  view.setUint32(5, Math.floor(sourceAmount / 0x100000000), true);

  // Settlement amount as u64 (little endian)
  view.setUint32(9, settlementAmount & 0xffffffff, true);
  view.setUint32(13, Math.floor(settlementAmount / 0x100000000), true);

  // Last 4 bytes of source mint (for identification)
  const sourceMintBytes = new TextEncoder().encode(sourceMint.slice(-4));
  new Uint8Array(buffer, 17, 4).set(sourceMintBytes);

  // Last 4 bytes of settlement mint (for identification)
  const settlementMintBytes = new TextEncoder().encode(settlementMint.slice(-4));
  new Uint8Array(buffer, 21, 4).set(settlementMintBytes);

  return Buffer.from(buffer).toString("base64");
}

// ============ TURNKEY TEE INTEGRATION ============

/**
 * Request signature from Turnkey TEE
 */
async function requestTurnkeySignature(
  subOrganizationId: string,
  walletAddress: string,
  unsignedTransaction: string
): Promise<string> {
  if (!TURNKEY_ORGANIZATION_ID) {
    throw new Error("Turnkey organization not configured");
  }

  try {
    // In production, this uses the Turnkey SDK with proper authentication
    // The server-side stamper signs the request
    const response = await fetch(`${TURNKEY_API_BASE}/public/v1/submit/sign_raw_payload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stamp": await generateServerStamp(),
      },
      body: JSON.stringify({
        type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD",
        organizationId: TURNKEY_ORGANIZATION_ID,
        parameters: {
          signWith: walletAddress,
          payload: unsignedTransaction,
          encoding: "PAYLOAD_ENCODING_BASE64",
          hashFunction: "HASH_FUNCTION_NO_OP",
        },
        timestampMs: Date.now().toString(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Turnkey signing failed: ${error}`);
    }

    const result = await response.json();

    if (result.activity?.status === "ACTIVITY_STATUS_COMPLETED") {
      // Combine unsigned transaction with signature
      return combineTransactionWithSignature(
        unsignedTransaction,
        result.activity.result.signRawPayloadResult.signature
      );
    }

    throw new Error(`Turnkey activity status: ${result.activity?.status}`);
  } catch (error) {
    console.error("[Turnkey] Signature request failed:", error);
    throw error;
  }
}

/**
 * Generate server-side stamp for Turnkey API
 */
async function generateServerStamp(): Promise<string> {
  // In production, this uses the server's API key to create a stamp
  // For DisCard, the server has propose-only permissions
  const apiKey = process.env.TURNKEY_API_PRIVATE_KEY;

  if (!apiKey) {
    throw new Error("Turnkey API key not configured");
  }

  // This is a placeholder - actual implementation uses @turnkey/sdk-server
  return Buffer.from(JSON.stringify({
    publicKey: process.env.TURNKEY_API_PUBLIC_KEY,
    timestamp: Date.now(),
  })).toString("base64");
}

/**
 * Combine unsigned transaction with signature
 */
function combineTransactionWithSignature(
  unsignedTx: string,
  signature: string
): string {
  // In production, properly construct the signed transaction
  // using @solana/web3.js Transaction class
  const txBytes = Buffer.from(unsignedTx, "base64");
  const sigBytes = Buffer.from(signature, "hex");

  // Simplified: prepend signature to transaction message
  const signedTx = Buffer.concat([
    Buffer.from([1]), // num signatures
    sigBytes,
    txBytes,
  ]);

  return signedTx.toString("base64");
}

// ============ FIREDANCER RPC INTEGRATION ============

/**
 * Submit transaction to Firedancer-optimized RPC
 */
async function submitToFiredancerRPC(signedTransaction: string): Promise<string> {
  // Use Helius Firedancer endpoint if available, otherwise standard RPC
  const rpcUrl = HELIUS_FIREDANCER_URL || SOLANA_RPC_URL;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [
          signedTransaction,
          {
            encoding: "base64",
            skipPreflight: true, // Skip for speed
            maxRetries: 0, // We handle retries
            preflightCommitment: "confirmed",
          },
        ],
      }),
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(`RPC error: ${result.error.message}`);
    }

    return result.result;
  } catch (error) {
    console.error("[Firedancer] Transaction submission failed:", error);
    throw error;
  }
}

/**
 * Wait for transaction confirmation with Alpenglow target tracking
 */
async function waitForConfirmation(
  signature: string,
  startTime: number
): Promise<{ confirmed: boolean; timeMs: number; error?: string }> {
  const rpcUrl = HELIUS_FIREDANCER_URL || SOLANA_RPC_URL;
  const pollInterval = 50; // 50ms polling for speed
  const maxAttempts = Math.ceil(MAX_CONFIRMATION_WAIT_MS / pollInterval);

  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignatureStatuses",
          params: [[signature], { searchTransactionHistory: false }],
        }),
      });

      const result = await response.json();
      const status = result.result?.value?.[0];

      if (status?.confirmationStatus) {
        const timeMs = Date.now() - startTime;

        if (status.err) {
          return {
            confirmed: false,
            timeMs,
            error: JSON.stringify(status.err),
          };
        }

        // Check if confirmed or finalized
        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          return { confirmed: true, timeMs };
        }
      }
    } catch (error) {
      // Continue polling on error
    }

    await sleep(pollInterval);
    attempts++;
  }

  return {
    confirmed: false,
    timeMs: Date.now() - startTime,
    error: "Confirmation timeout",
  };
}

/**
 * Serialize transaction for transmission
 */
function serializeTransaction(transaction: UnsignedTransaction): string {
  // In production, use @solana/web3.js Transaction.serialize()
  return Buffer.from(JSON.stringify(transaction)).toString("base64");
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
