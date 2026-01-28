/**
 * Audit Batch Anchoring Cron
 *
 * Runs every 15 minutes to anchor unanchored audit log entries to Solana.
 * Builds a SHA-256 Merkle tree from event hashes and stores the root on-chain.
 *
 * Escalation: If entries older than 30 minutes remain unanchored, triggers
 * an immediate batch run.
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Compute SHA-256 of a string, returning hex.
 */
async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build a SHA-256 Merkle tree from a list of hex-encoded hashes.
 * Returns the Merkle root as a hex string.
 */
async function buildMerkleRoot(hashes: string[]): Promise<string> {
  if (hashes.length === 0) {
    return "0".repeat(64); // Empty tree
  }

  if (hashes.length === 1) {
    return hashes[0];
  }

  // Pad to even number of leaves
  let level = [...hashes];
  if (level.length % 2 !== 0) {
    level.push(level[level.length - 1]);
  }

  // Build tree bottom-up
  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const combined = level[i] + level[i + 1];
      nextLevel.push(await sha256Hex(combined));
    }
    level = nextLevel;
    if (level.length > 1 && level.length % 2 !== 0) {
      level.push(level[level.length - 1]);
    }
  }

  return level[0];
}

/**
 * Main cron handler: query unanchored entries, build Merkle tree, submit anchor.
 */
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ anchored: number; merkleRoot?: string; txSignature?: string }> => {
    // Query unanchored entries (up to 100 per batch)
    const unanchored: Array<{ _id: string; timestamp: number; eventHash: string }> = await ctx.runQuery(
      internal.audit.auditLog.getUnanchored,
      { limit: 100 }
    );

    if (unanchored.length === 0) {
      console.log("[AuditAnchor] No unanchored entries, skipping");
      return { anchored: 0 };
    }

    // Check for stale entries (older than 30 minutes)
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;
    const hasStaleEntries = unanchored.some(
      (entry) => entry.timestamp < thirtyMinutesAgo
    );

    if (hasStaleEntries) {
      console.log(
        "[AuditAnchor] ESCALATION: Found entries older than 30 minutes, processing immediately"
      );
    }

    // Extract event hashes for Merkle tree
    const eventHashes = unanchored.map((entry) => entry.eventHash);
    const entryIds = unanchored.map((entry) => entry._id);

    // Build Merkle root
    const merkleRoot = await buildMerkleRoot(eventHashes);

    console.log(
      `[AuditAnchor] Anchoring ${unanchored.length} entries, merkleRoot=${merkleRoot.slice(0, 16)}...`
    );

    // Submit to Solana and mark entries anchored
    const result: { txSignature: string } = await ctx.runAction(
      internal.audit.anchorSolana.submitAnchorTransaction,
      {
        merkleRoot,
        batchSize: unanchored.length,
        entryIds,
      }
    );

    console.log(
      `[AuditAnchor] Anchored ${unanchored.length} entries, tx=${result.txSignature}`
    );

    return {
      anchored: unanchored.length,
      merkleRoot,
      txSignature: result.txSignature,
    };
  },
});
