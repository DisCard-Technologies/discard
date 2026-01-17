/**
 * Nullifier Registry
 * 
 * Persistent registry for tracking used nullifiers to prevent proof replay attacks.
 * Supports both in-memory (for development) and Convex backend (for production).
 */

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

// ============================================================================
// Types
// ============================================================================

export interface NullifierRecord {
  /** Nullifier hash */
  nullifier: string;
  /** Proof type that generated this nullifier */
  proofType: string;
  /** When the nullifier was used */
  usedAt: number;
  /** When the nullifier expires (for cleanup) */
  expiresAt: number;
  /** Context (e.g., user ID, transaction ID) */
  context?: string;
}

export interface NullifierRegistryConfig {
  /** Convex action executor (optional - uses in-memory if not provided) */
  convexActions?: ConvexNullifierActions;
  /** Auto-cleanup interval in ms (default: 5 minutes) */
  cleanupIntervalMs?: number;
}

/**
 * Convex actions for persistent nullifier storage
 */
export type ConvexNullifierActions = {
  markNullifierUsed: (args: {
    nullifier: string;
    proofType: string;
    expiresAt: number;
    proofHash?: string;
    context?: string;
    userId?: string;
  }) => Promise<{ success: boolean; replayDetected?: boolean }>;
  
  isNullifierUsed: (args: {
    nullifier: string;
  }) => Promise<boolean>;
  
  cleanupExpiredNullifiers: () => Promise<{ cleaned: number }>;
};

// ============================================================================
// Nullifier Registry
// ============================================================================

export class NullifierRegistry {
  private config: Required<NullifierRegistryConfig>;
  
  // In-memory cache (always used for fast lookups)
  private memoryCache: Set<string> = new Set();
  private expiryMap: Map<string, number> = new Map();
  
  // Cleanup timer
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: NullifierRegistryConfig = {}) {
    this.config = {
      convexActions: config.convexActions,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 5 * 60 * 1000, // 5 minutes
    } as Required<NullifierRegistryConfig>;
    
    // Start periodic cleanup
    this.startCleanup();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check if a nullifier has been used
   * 
   * @param nullifier - Nullifier hash to check
   * @returns True if nullifier is already used
   */
  async isNullifierUsed(nullifier: string): Promise<boolean> {
    // Check memory cache first (fast path)
    if (this.memoryCache.has(nullifier)) {
      return true;
    }
    
    // If using Convex, check persistent storage
    if (this.config.convexActions) {
      try {
        const used = await this.config.convexActions.isNullifierUsed({ nullifier });
        
        // Update memory cache
        if (used) {
          this.memoryCache.add(nullifier);
        }
        
        return used;
      } catch (error) {
        console.error('[NullifierRegistry] Failed to check Convex:', error);
        // Fall back to memory cache only
        return this.memoryCache.has(nullifier);
      }
    }
    
    return false;
  }

  /**
   * Mark a nullifier as used
   * 
   * @param record - Nullifier record to store
   * @returns Whether marking was successful (false if replay detected)
   */
  async markNullifierUsed(record: NullifierRecord): Promise<{ success: boolean; replayDetected?: boolean }> {
    const { nullifier, proofType, expiresAt, context } = record;
    
    // Check if already exists in memory
    if (this.memoryCache.has(nullifier)) {
      console.warn(`[NullifierRegistry] Replay detected in memory: ${nullifier.slice(0, 16)}...`);
      return { success: false, replayDetected: true };
    }
    
    // Add to memory cache immediately
    this.memoryCache.add(nullifier);
    this.expiryMap.set(nullifier, expiresAt);
    
    // Persist to Convex if available
    if (this.config.convexActions) {
      try {
        const result = await this.config.convexActions.markNullifierUsed({
          nullifier,
          proofType,
          expiresAt,
          context,
        });
        
        if (!result.success) {
          console.warn(`[NullifierRegistry] Replay detected in Convex: ${nullifier.slice(0, 16)}...`);
          return { success: false, replayDetected: true };
        }
        
        console.log(`[NullifierRegistry] Nullifier persisted: ${nullifier.slice(0, 16)}...`);
        return { success: true };
      } catch (error) {
        console.error('[NullifierRegistry] Failed to persist to Convex:', error);
        // Continue - memory cache is still updated
        return { success: true }; // Memory cache worked
      }
    }
    
    return { success: true };
  }

  /**
   * Clean up expired nullifiers
   * 
   * @returns Number of nullifiers cleaned
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Clean memory cache
    for (const [nullifier, expiresAt] of this.expiryMap.entries()) {
      if (now > expiresAt) {
        this.memoryCache.delete(nullifier);
        this.expiryMap.delete(nullifier);
        cleanedCount++;
      }
    }
    
    // Clean Convex storage
    if (this.config.convexActions) {
      try {
        const result = await this.config.convexActions.cleanupExpiredNullifiers();
        console.log(`[NullifierRegistry] Cleaned ${result.cleaned} nullifiers from Convex`);
      } catch (error) {
        console.error('[NullifierRegistry] Convex cleanup failed:', error);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[NullifierRegistry] Cleaned ${cleanedCount} expired nullifiers from memory. Active: ${this.memoryCache.size}`);
    }
    
    return cleanedCount;
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    activeNullifiers: number;
    oldestExpiry: number | null;
    newestExpiry: number | null;
    hasConvexBackend: boolean;
  } {
    const expiries = Array.from(this.expiryMap.values());
    
    return {
      activeNullifiers: this.memoryCache.size,
      oldestExpiry: expiries.length > 0 ? Math.min(...expiries) : null,
      newestExpiry: expiries.length > 0 ? Math.max(...expiries) : null,
      hasConvexBackend: !!this.config.convexActions,
    };
  }

  /**
   * Clear all nullifiers (testing only)
   */
  clearAll(): void {
    const count = this.memoryCache.size;
    this.memoryCache.clear();
    this.expiryMap.clear();
    console.log(`[NullifierRegistry] Cleared ${count} nullifiers`);
  }

  /**
   * Stop cleanup timer (call on shutdown)
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('[NullifierRegistry] Cleanup timer stopped');
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired().catch(error => {
        console.error('[NullifierRegistry] Cleanup failed:', error);
      });
    }, this.config.cleanupIntervalMs);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registryInstance: NullifierRegistry | null = null;

/**
 * Get nullifier registry instance
 */
export function getNullifierRegistry(config?: NullifierRegistryConfig): NullifierRegistry {
  if (!registryInstance && config) {
    registryInstance = new NullifierRegistry(config);
  }
  if (!registryInstance) {
    // Initialize with default config if not yet created
    registryInstance = new NullifierRegistry();
  }
  return registryInstance;
}

/**
 * Initialize nullifier registry with Convex backend
 */
export function initializeNullifierRegistry(config: NullifierRegistryConfig): NullifierRegistry {
  if (registryInstance) {
    registryInstance.shutdown();
  }
  registryInstance = new NullifierRegistry(config);
  return registryInstance;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a nullifier from proof data
 * 
 * @param nonce - Random nonce
 * @param proofType - Type of proof
 * @param additionalData - Additional data to include in hash (optional)
 * @returns Nullifier hash
 */
export function generateNullifier(
  nonce: string,
  proofType: string,
  additionalData?: string
): string {
  const data = new TextEncoder().encode(
    `${nonce}:${proofType}:discard-nullifier-v1${additionalData ? `:${additionalData}` : ''}`
  );
  return bytesToHex(sha256(data));
}

/**
 * Generate a cryptographically secure nonce
 * 
 * @returns 32-byte nonce as hex string
 */
export function generateSecureNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Verify nullifier corresponds to nonce and proof type
 * 
 * @param nullifier - Nullifier to verify
 * @param nonce - Original nonce
 * @param proofType - Original proof type
 * @returns True if nullifier is valid
 */
export function verifyNullifier(
  nullifier: string,
  nonce: string,
  proofType: string
): boolean {
  const expected = generateNullifier(nonce, proofType);
  return nullifier === expected;
}
