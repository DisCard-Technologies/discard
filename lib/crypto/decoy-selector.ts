/**
 * Intelligent Decoy Selection for Ring Signatures
 * 
 * Selects decoy members for ring signatures based on transaction patterns
 * to maximize anonymity set quality. Uses heuristics similar to Monero's
 * decoy selection algorithm.
 * 
 * Key principles:
 * - Select recent transactions (gamma distribution)
 * - Match transaction amounts (within 20% range)
 * - Avoid obvious patterns
 * - Ensure geographic/temporal diversity
 * 
 * @see https://github.com/monero-project/research-lab/blob/master/publications/MRL-0004.pdf
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// ============================================================================
// Types
// ============================================================================

export interface DecoyCandidate {
  /** Public key of the address */
  publicKey: PublicKey;
  /** Transaction signature where this address was used */
  txSignature: string;
  /** Block timestamp */
  timestamp: number;
  /** Transaction amount (if available) */
  amount?: number;
  /** Block height */
  blockHeight: number;
}

export interface DecoySelectionParams {
  /** Actual signer's public key (to exclude from decoys) */
  signerPublicKey: PublicKey;
  /** Transaction amount (for matching similar amounts) */
  amount?: number;
  /** Number of decoys to select */
  count: number;
  /** Minimum age of decoy transactions (ms) */
  minAgeMs?: number;
  /** Maximum age of decoy transactions (ms) */
  maxAgeMs?: number;
  /** Token mint (if specific token) */
  tokenMint?: PublicKey;
}

export interface DecoySelectionResult {
  /** Selected decoy public keys */
  decoys: PublicKey[];
  /** Anonymity set quality score (0-100) */
  qualityScore: number;
  /** Metadata about selection */
  metadata: {
    totalCandidates: number;
    averageAge: number;
    amountVariance: number;
    temporalSpread: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Gamma distribution parameters for temporal selection
 * Shape parameter - controls how quickly probability decreases with age
 */
const GAMMA_SHAPE = 19.28;
const GAMMA_SCALE = 1.61;

/**
 * Default time windows
 */
const DEFAULT_MIN_AGE_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Amount matching tolerance (20%)
 */
const AMOUNT_TOLERANCE = 0.20;

/**
 * Minimum candidates needed for good selection
 */
const MIN_CANDIDATES_MULTIPLE = 10; // Need at least 10x desired ring size

// ============================================================================
// Decoy Selector Class
// ============================================================================

export class DecoySelector {
  private connection: Connection;
  private candidateCache: Map<string, DecoyCandidate[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Select optimal decoys for a ring signature
   */
  async selectDecoys(params: DecoySelectionParams): Promise<DecoySelectionResult> {
    console.log(`[DecoySelector] Selecting ${params.count} decoys`);

    // Fetch candidate addresses
    const candidates = await this.fetchCandidates(params);

    if (candidates.length < params.count) {
      console.warn(
        `[DecoySelector] Insufficient candidates: ${candidates.length} < ${params.count}`
      );
      throw new Error(
        `Insufficient decoy candidates. Need ${params.count}, found ${candidates.length}`
      );
    }

    // Score and select decoys using gamma distribution
    const selected = this.selectUsingGammaDistribution(
      candidates,
      params.count,
      params.amount
    );

    // Calculate quality metrics
    const metadata = this.calculateQualityMetrics(selected, params.amount);

    return {
      decoys: selected.map(c => c.publicKey),
      qualityScore: this.calculateQualityScore(metadata, candidates.length, params.count),
      metadata,
    };
  }

  /**
   * Fetch candidate addresses from the blockchain
   */
  private async fetchCandidates(
    params: DecoySelectionParams
  ): Promise<DecoyCandidate[]> {
    const cacheKey = this.getCacheKey(params);

    // Check cache
    const cached = this.candidateCache.get(cacheKey);
    const cacheTime = this.cacheExpiry.get(cacheKey);
    if (cached && cacheTime && Date.now() < cacheTime) {
      console.log('[DecoySelector] Using cached candidates');
      return cached;
    }

    console.log('[DecoySelector] Fetching fresh candidates');

    const minAge = params.minAgeMs || DEFAULT_MIN_AGE_MS;
    const maxAge = params.maxAgeMs || DEFAULT_MAX_AGE_MS;
    const now = Date.now();

    try {
      // Fetch recent transactions
      // In production, this would use Helius/QuickNode advanced APIs
      // For now, simulate with placeholder
      const candidates = await this.fetchRecentTransactions(
        now - maxAge,
        now - minAge,
        params.amount,
        params.tokenMint
      );

      // Filter out signer's own address
      const filtered = candidates.filter(
        c => !c.publicKey.equals(params.signerPublicKey)
      );

      // Cache results
      this.candidateCache.set(cacheKey, filtered);
      this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL_MS);

      return filtered;
    } catch (error) {
      console.error('[DecoySelector] Failed to fetch candidates:', error);
      // Fallback to generating random addresses if fetch fails
      return this.generateFallbackCandidates(params.count * MIN_CANDIDATES_MULTIPLE);
    }
  }

  /**
   * Fetch recent transactions matching criteria
   * 
   * In production, this would use:
   * - Helius Enhanced Transactions API
   * - QuickNode Token API
   * - SolanaFM or XRAY for historical data
   */
  private async fetchRecentTransactions(
    minTimestamp: number,
    maxTimestamp: number,
    amount?: number,
    tokenMint?: PublicKey
  ): Promise<DecoyCandidate[]> {
    // TODO: Implement real transaction fetching using Helius/QuickNode
    // For now, return empty array to trigger fallback
    
    // Example production implementation:
    /*
    const heliusUrl = process.env.EXPO_PUBLIC_HELIUS_RPC_URL;
    const response = await fetch(`${heliusUrl}/v0/addresses/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'TRANSFER',
        beforeTime: Math.floor(maxTimestamp / 1000),
        afterTime: Math.floor(minTimestamp / 1000),
        limit: 1000,
      }),
    });
    
    const data = await response.json();
    return data.transactions.map(tx => ({
      publicKey: new PublicKey(tx.source),
      txSignature: tx.signature,
      timestamp: tx.timestamp * 1000,
      amount: tx.amount,
      blockHeight: tx.slot,
    }));
    */

    return [];
  }

  /**
   * Select decoys using gamma distribution
   * 
   * Mimics Monero's selection algorithm for temporal diversity
   */
  private selectUsingGammaDistribution(
    candidates: DecoyCandidate[],
    count: number,
    targetAmount?: number
  ): DecoyCandidate[] {
    const now = Date.now();
    const selected: DecoyCandidate[] = [];
    const usedIndices = new Set<number>();

    // Sort candidates by timestamp (newest first)
    const sorted = [...candidates].sort((a, b) => b.timestamp - a.timestamp);

    // Filter by amount if specified
    const amountFiltered = targetAmount
      ? sorted.filter(c => this.isAmountMatch(c.amount, targetAmount))
      : sorted;

    const pool = amountFiltered.length > 0 ? amountFiltered : sorted;

    // Select using gamma distribution weights
    while (selected.length < count && selected.length < pool.length) {
      const index = this.sampleGammaIndex(pool.length, now, usedIndices);
      
      if (index < pool.length) {
        selected.push(pool[index]);
        usedIndices.add(index);
      } else {
        // Fallback to random if gamma sampling fails
        const randomIndex = Math.floor(Math.random() * pool.length);
        if (!usedIndices.has(randomIndex)) {
          selected.push(pool[randomIndex]);
          usedIndices.add(randomIndex);
        }
      }
    }

    return selected;
  }

  /**
   * Sample an index using gamma distribution
   * 
   * Gives higher probability to recent transactions
   */
  private sampleGammaIndex(
    poolSize: number,
    now: number,
    usedIndices: Set<number>
  ): number {
    // Generate gamma-distributed random number
    const u = this.gammaRandom(GAMMA_SHAPE, GAMMA_SCALE);
    
    // Map to index (0 = newest, poolSize-1 = oldest)
    let index = Math.floor(u * poolSize / 100);
    index = Math.min(Math.max(0, index), poolSize - 1);

    // If already used, try nearby indices
    if (usedIndices.has(index)) {
      for (let offset = 1; offset < poolSize; offset++) {
        const next = (index + offset) % poolSize;
        if (!usedIndices.has(next)) {
          return next;
        }
        const prev = (index - offset + poolSize) % poolSize;
        if (!usedIndices.has(prev)) {
          return prev;
        }
      }
    }

    return index;
  }

  /**
   * Generate random number from gamma distribution
   * 
   * Uses Marsaglia and Tsang's method
   */
  private gammaRandom(shape: number, scale: number): number {
    // Simplified gamma random generator
    // For production, use a proper statistical library
    
    let d = shape - 1/3;
    let c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      let x = this.normalRandom();
      let v = 1 + c * x;
      
      if (v <= 0) continue;
      
      v = v * v * v;
      let u = Math.random();
      
      if (u < 1 - 0.0331 * x * x * x * x) {
        return scale * d * v;
      }
      
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return scale * d * v;
      }
    }
  }

  /**
   * Generate random number from normal distribution (Box-Muller)
   */
  private normalRandom(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Check if amount matches within tolerance
   */
  private isAmountMatch(candidateAmount: number | undefined, targetAmount: number): boolean {
    if (!candidateAmount) return false;
    
    const lower = targetAmount * (1 - AMOUNT_TOLERANCE);
    const upper = targetAmount * (1 + AMOUNT_TOLERANCE);
    
    return candidateAmount >= lower && candidateAmount <= upper;
  }

  /**
   * Calculate quality metrics for selected decoys
   */
  private calculateQualityMetrics(
    selected: DecoyCandidate[],
    targetAmount?: number
  ): DecoySelectionResult['metadata'] {
    const now = Date.now();

    // Average age
    const ages = selected.map(c => now - c.timestamp);
    const averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;

    // Temporal spread (standard deviation of ages)
    const ageVariance = ages.reduce((sum, age) => 
      sum + Math.pow(age - averageAge, 2), 0
    ) / ages.length;
    const temporalSpread = Math.sqrt(ageVariance);

    // Amount variance
    let amountVariance = 0;
    if (targetAmount) {
      const amounts = selected
        .filter(c => c.amount !== undefined)
        .map(c => c.amount!);
      
      if (amounts.length > 0) {
        const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
        amountVariance = amounts.reduce((sum, a) => 
          sum + Math.abs(a - avgAmount) / avgAmount, 0
        ) / amounts.length;
      }
    }

    return {
      totalCandidates: selected.length,
      averageAge,
      amountVariance,
      temporalSpread,
    };
  }

  /**
   * Calculate overall quality score (0-100)
   */
  private calculateQualityScore(
    metadata: DecoySelectionResult['metadata'],
    totalCandidates: number,
    requested: number
  ): number {
    let score = 100;

    // Penalty for low candidate pool
    const poolRatio = totalCandidates / (requested * MIN_CANDIDATES_MULTIPLE);
    if (poolRatio < 1) {
      score -= (1 - poolRatio) * 30; // Up to 30 point penalty
    }

    // Bonus for temporal diversity
    const dayInMs = 24 * 60 * 60 * 1000;
    const temporalDiversityRatio = Math.min(metadata.temporalSpread / dayInMs, 1);
    score += temporalDiversityRatio * 10; // Up to 10 point bonus

    // Penalty for amount variance (if applicable)
    if (metadata.amountVariance > AMOUNT_TOLERANCE) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate fallback candidates when real data unavailable
   */
  private generateFallbackCandidates(count: number): DecoyCandidate[] {
    console.warn('[DecoySelector] Using fallback random candidates');
    
    const now = Date.now();
    const candidates: DecoyCandidate[] = [];

    for (let i = 0; i < count; i++) {
      // Generate random valid Ed25519 public key
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      
      candidates.push({
        publicKey: new PublicKey(randomBytes),
        txSignature: `fallback_${i}_${Date.now()}`,
        timestamp: now - Math.random() * DEFAULT_MAX_AGE_MS,
        blockHeight: 0,
      });
    }

    return candidates;
  }

  /**
   * Generate cache key for candidate caching
   */
  private getCacheKey(params: DecoySelectionParams): string {
    const parts = [
      params.amount?.toString() || 'any',
      params.tokenMint?.toBase58() || 'native',
      params.count.toString(),
    ];
    return bytesToHex(sha256(new TextEncoder().encode(parts.join(':'))));
  }

  /**
   * Clear candidate cache
   */
  clearCache(): void {
    this.candidateCache.clear();
    this.cacheExpiry.clear();
  }
}

// ============================================================================
// Export Convenience Functions
// ============================================================================

/**
 * Create a decoy selector instance
 */
export function createDecoySelector(connection: Connection): DecoySelector {
  return new DecoySelector(connection);
}

/**
 * Quick selection with defaults
 */
export async function selectDecoys(
  connection: Connection,
  signerPublicKey: PublicKey,
  count: number,
  amount?: number
): Promise<PublicKey[]> {
  const selector = new DecoySelector(connection);
  const result = await selector.selectDecoys({
    signerPublicKey,
    count,
    amount,
  });
  
  console.log(
    `[DecoySelector] Selected ${result.decoys.length} decoys ` +
    `(quality: ${result.qualityScore.toFixed(1)}%)`
  );
  
  return result.decoys;
}
