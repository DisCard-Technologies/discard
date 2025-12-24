/**
 * DisCard 2035 - ZK Proof Handling
 *
 * Server-side functions for managing ZK proofs used in
 * compressed account verification and state updates.
 */

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  action,
  internalAction,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Types & Validators
// ============================================================================

const proofTypeValidator = v.union(
  v.literal("validity"),        // State validity proof
  v.literal("inclusion"),       // Merkle inclusion proof
  v.literal("non_inclusion"),   // Non-membership proof
  v.literal("state_transition") // State update proof
);

const proofStatusValidator = v.union(
  v.literal("pending"),
  v.literal("verified"),
  v.literal("failed"),
  v.literal("expired")
);

// Groth16 proof structure
const groth16ProofValidator = v.object({
  a: v.array(v.number()),       // G1 point (2 elements)
  b: v.array(v.number()),       // G2 point (4 elements)
  c: v.array(v.number()),       // G1 point (2 elements)
});

// Merkle proof structure
const merkleProofValidator = v.object({
  leaf: v.string(),
  root: v.string(),
  path: v.array(v.object({
    sibling: v.string(),
    isLeft: v.boolean(),
  })),
});

// ============================================================================
// Proof Verification Functions
// ============================================================================

/**
 * Verify a Groth16 proof
 * Note: In production, this would call a native verification library
 */
export const verifyGroth16Proof = action({
  args: {
    proof: groth16ProofValidator,
    publicInputs: v.array(v.string()),
    verificationKeyId: v.string(),
  },
  handler: async (ctx, args): Promise<{ valid: boolean; error?: string }> => {
    try {
      // In production, this would:
      // 1. Fetch the verification key
      // 2. Verify the Groth16 proof using a ZK verification library
      // 3. Return the result

      // For now, we do basic structural validation
      if (args.proof.a.length !== 2) {
        return { valid: false, error: "Invalid proof: a must have 2 elements" };
      }
      if (args.proof.b.length !== 4) {
        return { valid: false, error: "Invalid proof: b must have 4 elements" };
      }
      if (args.proof.c.length !== 2) {
        return { valid: false, error: "Invalid proof: c must have 2 elements" };
      }

      // Placeholder: assume valid for development
      // In production, replace with actual verification
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown verification error"
      };
    }
  },
});

/**
 * Verify a Merkle inclusion proof
 */
export const verifyMerkleProof = action({
  args: {
    proof: merkleProofValidator,
  },
  handler: async (ctx, args): Promise<{ valid: boolean; computedRoot?: string }> => {
    try {
      const { leaf, path, root } = args.proof;

      // Simulate Poseidon hashing up the tree
      // In production, use actual Poseidon hash
      let currentHash = leaf;

      for (const { sibling, isLeft } of path) {
        // Poseidon(left, right)
        if (isLeft) {
          currentHash = simulatePoseidonHash(sibling, currentHash);
        } else {
          currentHash = simulatePoseidonHash(currentHash, sibling);
        }
      }

      return {
        valid: currentHash === root,
        computedRoot: currentHash,
      };
    } catch (error) {
      return { valid: false };
    }
  },
});

// ============================================================================
// Proof Storage Functions
// ============================================================================

/**
 * Store a validity proof for later verification
 */
export const storeProof = mutation({
  args: {
    compressedAccountId: v.id("compressedAccounts"),
    proofType: proofTypeValidator,
    proofData: v.bytes(),
    publicInputs: v.array(v.string()),
    merkleRoot: v.optional(v.string()),
    slot: v.number(),
  },
  handler: async (ctx, args) => {
    // For now, we store proof reference in the compressed account
    // In production, might use a separate proofs table

    await ctx.db.patch(args.compressedAccountId, {
      lastProofSlot: args.slot,
      updatedAt: Date.now(),
    });

    return { stored: true };
  },
});

/**
 * Get the latest proof for a compressed account
 */
export const getLatestProof = query({
  args: { compressedAccountId: v.id("compressedAccounts") },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.compressedAccountId);
    if (!account) {
      return null;
    }

    return {
      slot: account.lastProofSlot,
      signature: account.lastProofSignature,
      stateHash: account.stateHash,
    };
  },
});

// ============================================================================
// Batch Proof Operations
// ============================================================================

/**
 * Batch verify multiple proofs
 */
export const batchVerifyProofs = action({
  args: {
    proofs: v.array(v.object({
      proof: groth16ProofValidator,
      publicInputs: v.array(v.string()),
      verificationKeyId: v.string(),
    })),
  },
  handler: async (ctx, args): Promise<{ results: boolean[]; allValid: boolean }> => {
    const results: boolean[] = [];

    for (const proofData of args.proofs) {
      const result = await ctx.runAction(
        // @ts-ignore - internal action call
        "compression/proofs:verifyGroth16Proof",
        proofData
      );
      results.push(result.valid);
    }

    return {
      results,
      allValid: results.every(Boolean),
    };
  },
});

// ============================================================================
// State Transition Verification
// ============================================================================

/**
 * Verify a state transition is valid
 */
export const verifyStateTransition = action({
  args: {
    previousStateHash: v.string(),
    newStateHash: v.string(),
    transitionProof: groth16ProofValidator,
    publicInputs: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{
    valid: boolean;
    error?: string;
  }> => {
    try {
      // Verify the public inputs include both state hashes
      const expectedInputs = [args.previousStateHash, args.newStateHash];

      if (!expectedInputs.every((input) => args.publicInputs.includes(input))) {
        return {
          valid: false,
          error: "Public inputs must include previous and new state hashes",
        };
      }

      // Verify the transition proof
      const proofResult = await ctx.runAction(
        // @ts-ignore
        "compression/proofs:verifyGroth16Proof",
        {
          proof: args.transitionProof,
          publicInputs: args.publicInputs,
          verificationKeyId: "state_transition_v1",
        }
      );

      return proofResult;
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  },
});

/**
 * Verify card spending is within limits
 */
export const verifySpendingProof = action({
  args: {
    cardStateHash: v.string(),
    spendAmount: v.number(),
    currentDailySpend: v.number(),
    dailyLimit: v.number(),
    proof: groth16ProofValidator,
  },
  handler: async (ctx, args): Promise<{ valid: boolean; error?: string }> => {
    // Check amounts are valid
    if (args.spendAmount < 0) {
      return { valid: false, error: "Spend amount cannot be negative" };
    }

    if (args.currentDailySpend + args.spendAmount > args.dailyLimit) {
      return { valid: false, error: "Spending would exceed daily limit" };
    }

    // Verify the ZK proof that the card has sufficient balance
    // and the spending is authorized
    const publicInputs = [
      args.cardStateHash,
      args.spendAmount.toString(),
      args.currentDailySpend.toString(),
      args.dailyLimit.toString(),
    ];

    return ctx.runAction(
      // @ts-ignore
      "compression/proofs:verifyGroth16Proof",
      {
        proof: args.proof,
        publicInputs,
        verificationKeyId: "spending_v1",
      }
    );
  },
});

// ============================================================================
// Recovery Proof Verification
// ============================================================================

/**
 * Verify a social recovery proof
 */
export const verifyRecoveryProof = action({
  args: {
    didCommitmentHash: v.string(),
    newKeyCommitment: v.string(),
    guardianAttestations: v.array(v.object({
      guardianDid: v.string(),
      attestationHash: v.string(),
    })),
    threshold: v.number(),
    proof: groth16ProofValidator,
  },
  handler: async (ctx, args): Promise<{ valid: boolean; error?: string }> => {
    // Check threshold is met
    if (args.guardianAttestations.length < args.threshold) {
      return {
        valid: false,
        error: `Insufficient attestations: ${args.guardianAttestations.length}/${args.threshold}`,
      };
    }

    // Build public inputs for recovery proof
    const publicInputs = [
      args.didCommitmentHash,
      args.newKeyCommitment,
      args.threshold.toString(),
      ...args.guardianAttestations.map((a) => a.attestationHash),
    ];

    // Verify the ZK proof
    return ctx.runAction(
      // @ts-ignore
      "compression/proofs:verifyGroth16Proof",
      {
        proof: args.proof,
        publicInputs,
        verificationKeyId: "recovery_v1",
      }
    );
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simulate Poseidon hash (placeholder for actual implementation)
 * In production, use the real Poseidon hash function
 */
function simulatePoseidonHash(left: string, right: string): string {
  // This is a placeholder - in production use actual Poseidon
  const combined = left + right;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "0x" + Math.abs(hash).toString(16).padStart(64, "0");
}

/**
 * Generate verification key ID for a proof type
 */
export function getVerificationKeyId(
  proofType: "validity" | "spending" | "recovery" | "state_transition"
): string {
  const keyIds: Record<string, string> = {
    validity: "validity_v1",
    spending: "spending_v1",
    recovery: "recovery_v1",
    state_transition: "state_transition_v1",
  };
  return keyIds[proofType] ?? "default_v1";
}

// ============================================================================
// Proof Generation Helpers (Client-Side)
// ============================================================================

/**
 * Get the parameters needed for generating a validity proof
 */
export const getProofParams = query({
  args: { compressedAccountId: v.id("compressedAccounts") },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.compressedAccountId);
    if (!account) {
      return null;
    }

    return {
      merkleTreeAddress: account.merkleTreeAddress,
      leafIndex: account.leafIndex,
      stateHash: account.stateHash,
      accountType: account.accountType,
    };
  },
});
