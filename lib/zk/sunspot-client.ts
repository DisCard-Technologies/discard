/**
 * Sunspot ZK Proof Client
 *
 * Client for generating and verifying Noir/Groth16 zero-knowledge proofs on Solana.
 * Used for:
 * - Proving spending limits without revealing balance
 * - Proving compliance without revealing identity
 * - Proving thresholds without revealing actual values
 *
 * @see https://github.com/solana-foundation/noir-examples
 * @see https://github.com/Lightprotocol/groth16-solana
 */

import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

// ============ TYPES ============

/**
 * Supported proof types
 */
export type ProofType =
  | 'spending_limit'    // Prove balance >= amount
  | 'compliance'        // Prove not sanctioned
  | 'balance_threshold' // Prove balance meets threshold
  | 'age_verification'  // Prove age >= minimum
  | 'kyc_level';        // Prove KYC level >= required

/**
 * Public inputs for spending limit proof
 */
export interface SpendingLimitInputs {
  /** Transaction amount (public) */
  amount: bigint;
  /** Balance commitment (public) */
  commitment: string;
}

/**
 * Private witness for spending limit proof
 */
export interface SpendingLimitWitness {
  /** Actual balance (private) */
  balance: bigint;
  /** Randomness used in commitment (private) */
  randomness: string;
}

/**
 * Public inputs for compliance proof
 */
export interface ComplianceInputs {
  /** Merkle root of sanctions list (public) */
  sanctionsRoot: string;
  /** User address commitment (public) */
  addressCommitment: string;
}

/**
 * Private witness for compliance proof
 */
export interface ComplianceWitness {
  /** User's wallet address (private) */
  walletAddress: string;
  /** Merkle path proving non-inclusion (private) */
  merklePath: string[];
  /** Path indices (private) */
  pathIndices: number[];
}

/**
 * Generated proof with replay protection
 */
export interface ZkProof {
  /** Proof type */
  type: ProofType;
  /** Serialized proof bytes */
  proof: Uint8Array;
  /** Public inputs */
  publicInputs: Uint8Array;
  /** Proof hash for deduplication */
  hash: string;
  /** Replay protection metadata */
  replayProtection: {
    /** Random nonce (prevents replay) */
    nonce: string;
    /** Proof generation timestamp */
    timestamp: number;
    /** Proof expiry timestamp */
    expiresAt: number;
    /** Nullifier hash (derived from nonce + proof data) */
    nullifier: string;
  };
}

/**
 * Verification result
 */
export interface VerificationResult {
  /** Whether proof is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** On-chain transaction signature */
  txSignature?: string;
  /** Whether proof was rejected due to replay */
  replayDetected?: boolean;
  /** Nullifier that was checked */
  nullifier?: string;
}

/**
 * Sunspot configuration
 */
export interface SunspotConfig {
  /** Solana RPC connection */
  connection: Connection;
  /** Verifier program ID */
  verifierProgramId: PublicKey;
  /** Proof generation endpoint (if using server-side generation) */
  proverEndpoint?: string;
}

// ============ CONSTANTS ============

/**
 * Default verifier program ID (Light Protocol Groth16)
 */
export const DEFAULT_VERIFIER_PROGRAM_ID = new PublicKey(
  'Verifier111111111111111111111111111111111111' // Placeholder - use actual program ID
);

/**
 * Groth16 proof size (constant)
 */
export const GROTH16_PROOF_SIZE = 128;

/**
 * Approximate verification compute units
 */
export const VERIFICATION_COMPUTE_UNITS = 200000;

/**
 * Default proof validity duration (1 hour)
 */
export const DEFAULT_PROOF_VALIDITY_MS = 60 * 60 * 1000;

// ============ SERVICE CLASS ============

/**
 * Sunspot ZK Proof Service
 *
 * Handles proof generation and on-chain verification.
 */
export class SunspotService {
  private config: SunspotConfig;
  
  // Nullifier registry to prevent proof replay
  private usedNullifiers: Set<string> = new Set();
  
  // Optional: Nullifier expiry tracking (remove old nullifiers to save memory)
  private nullifierExpiry: Map<string, number> = new Map();

  constructor(config: SunspotConfig) {
    this.config = config;
    
    // Clean up expired nullifiers every 5 minutes
    setInterval(() => this.cleanupExpiredNullifiers(), 5 * 60 * 1000);
  }

  // ============ SPENDING LIMIT PROOFS ============

  /**
   * Generate a proof that balance >= amount without revealing balance
   */
  async generateSpendingLimitProof(
    inputs: SpendingLimitInputs,
    witness: SpendingLimitWitness,
    validityMs: number = DEFAULT_PROOF_VALIDITY_MS
  ): Promise<ZkProof> {
    console.log('[Sunspot] Generating spending limit proof');

    // Validate witness
    if (witness.balance < inputs.amount) {
      throw new Error('Balance is less than amount - proof would be invalid');
    }

    // Generate replay protection metadata
    const replayProtection = this.generateReplayProtection(validityMs);

    // In production, this would:
    // 1. Load the compiled Noir circuit
    // 2. Generate witness (including nonce in public inputs)
    // 3. Run Groth16 prover
    // For now, return mock proof structure

    const publicInputs = this.encodeSpendingLimitInputs(inputs);
    const proof = await this.generateProof('spending_limit', publicInputs, witness);

    return {
      type: 'spending_limit',
      proof: proof,
      publicInputs: publicInputs,
      hash: await this.hashProof(proof, publicInputs),
      replayProtection,
    };
  }

  /**
   * Verify spending limit proof on-chain
   */
  async verifySpendingLimitProof(
    proof: ZkProof,
    payer: PublicKey
  ): Promise<VerificationResult> {
    if (proof.type !== 'spending_limit') {
      return { valid: false, error: 'Invalid proof type' };
    }

    // Check replay protection BEFORE on-chain verification
    const replayCheck = this.checkReplayProtection(proof);
    if (!replayCheck.valid) {
      return replayCheck;
    }

    // Verify proof on-chain
    const result = await this.verifyOnChain(proof, payer);
    
    // If verification succeeds, mark nullifier as used
    if (result.valid) {
      this.markNullifierUsed(proof.replayProtection.nullifier, proof.replayProtection.expiresAt);
    }
    
    return result;
  }

  // ============ COMPLIANCE PROOFS ============

  /**
   * Generate a proof that user is not on sanctions list
   */
  async generateComplianceProof(
    inputs: ComplianceInputs,
    witness: ComplianceWitness,
    validityMs: number = DEFAULT_PROOF_VALIDITY_MS
  ): Promise<ZkProof> {
    console.log('[Sunspot] Generating compliance proof');

    // Generate replay protection metadata
    const replayProtection = this.generateReplayProtection(validityMs);

    const publicInputs = this.encodeComplianceInputs(inputs);
    const proof = await this.generateProof('compliance', publicInputs, witness);

    return {
      type: 'compliance',
      proof: proof,
      publicInputs: publicInputs,
      hash: await this.hashProof(proof, publicInputs),
      replayProtection,
    };
  }

  /**
   * Verify compliance proof on-chain
   */
  async verifyComplianceProof(
    proof: ZkProof,
    payer: PublicKey
  ): Promise<VerificationResult> {
    if (proof.type !== 'compliance') {
      return { valid: false, error: 'Invalid proof type' };
    }

    // Check replay protection
    const replayCheck = this.checkReplayProtection(proof);
    if (!replayCheck.valid) {
      return replayCheck;
    }

    const result = await this.verifyOnChain(proof, payer);
    
    if (result.valid) {
      this.markNullifierUsed(proof.replayProtection.nullifier, proof.replayProtection.expiresAt);
    }
    
    return result;
  }

  // ============ BALANCE THRESHOLD PROOFS ============

  /**
   * Generate a proof that balance meets a threshold
   */
  async generateBalanceThresholdProof(
    threshold: bigint,
    balance: bigint,
    commitment: string,
    randomness: string,
    validityMs: number = DEFAULT_PROOF_VALIDITY_MS
  ): Promise<ZkProof> {
    console.log('[Sunspot] Generating balance threshold proof');

    if (balance < threshold) {
      throw new Error('Balance below threshold - proof would be invalid');
    }

    // Generate replay protection metadata
    const replayProtection = this.generateReplayProtection(validityMs);

    const inputs = {
      threshold,
      commitment,
    };

    const witness = {
      balance,
      randomness,
    };

    const publicInputs = this.encodeThresholdInputs(inputs);
    const proof = await this.generateProof('balance_threshold', publicInputs, witness);

    return {
      type: 'balance_threshold',
      proof: proof,
      publicInputs: publicInputs,
      hash: await this.hashProof(proof, publicInputs),
      replayProtection,
    };
  }

  // ============ COMMITMENT UTILITIES ============

  /**
   * Generate a Pedersen commitment to a value
   * commitment = hash(value || randomness)
   */
  async generateCommitment(value: bigint, randomness?: string): Promise<{
    commitment: string;
    randomness: string;
  }> {
    const rand = randomness || this.generateRandomness();

    // Use Web Crypto for hashing
    const data = new TextEncoder().encode(`${value}||${rand}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const commitment = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return { commitment, randomness: rand };
  }

  /**
   * Verify a commitment opens to a value
   */
  async verifyCommitment(
    commitment: string,
    value: bigint,
    randomness: string
  ): Promise<boolean> {
    const { commitment: computed } = await this.generateCommitment(value, randomness);
    return computed === commitment;
  }

  // ============ ON-CHAIN VERIFICATION ============

  /**
   * Build verification instruction
   */
  buildVerificationInstruction(
    proof: ZkProof,
    payer: PublicKey
  ): TransactionInstruction {
    // Build instruction data: [proof_type (1 byte)][proof (128 bytes)][public_inputs (variable)]
    const proofTypeIndex = this.getProofTypeIndex(proof.type);
    const data = Buffer.concat([
      Buffer.from([proofTypeIndex]),
      Buffer.from(proof.proof),
      Buffer.from(proof.publicInputs),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
      ],
      programId: this.config.verifierProgramId,
      data,
    });
  }

  /**
   * Verify proof on-chain
   */
  private async verifyOnChain(
    proof: ZkProof,
    payer: PublicKey
  ): Promise<VerificationResult> {
    try {
      const instruction = this.buildVerificationInstruction(proof, payer);

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = payer;

      const { blockhash } = await this.config.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Note: In production, this would be signed and sent
      // For now, simulate the verification
      const simulation = await this.config.connection.simulateTransaction(transaction);

      if (simulation.value.err) {
        return {
          valid: false,
          error: `Verification failed: ${JSON.stringify(simulation.value.err)}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  // ============ INTERNAL HELPERS ============

  /**
   * Generate proof (placeholder - would use actual Noir/Groth16 prover)
   */
  private async generateProof(
    type: ProofType,
    publicInputs: Uint8Array,
    witness: unknown
  ): Promise<Uint8Array> {
    console.log(`[Sunspot] Generating ${type} proof with ${publicInputs.length} bytes of public inputs`);

    // Try to load and use real Noir circuit
    try {
      // Check if Noir is available
      const { Noir } = await import('@noir-lang/noir_js');
      const { BarretenbergBackend } = await import('@noir-lang/backend_barretenberg');

      // Load compiled circuit for proof type
      const circuit = await this.loadCircuit(type);
      
      if (circuit) {
        console.log(`[Sunspot] Using real Noir circuit for ${type}`);
        
        // Initialize backend
        const backend = new BarretenbergBackend(circuit);
        const noir = new Noir(circuit, backend);

        // Prepare inputs (convert witness to Noir format)
        const noirInputs = this.prepareNoirInputs(type, publicInputs, witness);

        // Generate actual Groth16 proof
        const { proof } = await noir.generateProof(noirInputs);

        console.log(`[Sunspot] Generated real proof: ${proof.length} bytes`);
        return proof;
      }
    } catch (error) {
      console.warn(`[Sunspot] Noir not available or circuit not found, using mock proof:`, error);
    }

    // Fallback to mock proof if Noir unavailable
    console.log(`[Sunspot] Using mock proof for ${type}`);
    const mockProof = new Uint8Array(GROTH16_PROOF_SIZE);
    crypto.getRandomValues(mockProof);

    return mockProof;
  }

  /**
   * Load compiled Noir circuit for proof type
   * 
   * Circuits should be pre-compiled and stored in lib/zk/circuits/compiled/
   */
  private async loadCircuit(type: ProofType): Promise<any> {
    try {
      // In production, circuits would be compiled during build
      // and stored as JSON files
      const circuitPath = `./circuits/compiled/${type}.json`;
      
      // Dynamic import would happen here
      // For now, return null to use mock
      return null;
    } catch (error) {
      console.log(`[Sunspot] Circuit ${type} not found:`, error);
      return null;
    }
  }

  /**
   * Prepare inputs in Noir format
   */
  private prepareNoirInputs(
    type: ProofType,
    publicInputs: Uint8Array,
    witness: unknown
  ): Record<string, any> {
    // Convert public inputs and witness to Noir's expected format
    // This mapping depends on the specific circuit definition
    
    switch (type) {
      case 'spending_limit':
        return this.prepareSpendingLimitInputs(publicInputs, witness);
      case 'compliance':
        return this.prepareComplianceInputs(publicInputs, witness);
      case 'balance_threshold':
        return this.prepareBalanceThresholdInputs(publicInputs, witness);
      case 'age_verification':
        return this.prepareAgeVerificationInputs(publicInputs, witness);
      case 'kyc_level':
        return this.prepareKycLevelInputs(publicInputs, witness);
      default:
        throw new Error(`Unknown proof type: ${type}`);
    }
  }

  private prepareSpendingLimitInputs(publicInputs: Uint8Array, witness: unknown): Record<string, any> {
    const w = witness as SpendingLimitWitness;
    // Extract amount from public inputs
    const amount = this.bytesToBigint(publicInputs.slice(0, 32));

    return {
      // Public inputs
      amount: amount.toString(),
      // Private witness
      balance: w.balance.toString(),
      randomness: w.randomness,
    };
  }

  private prepareComplianceInputs(publicInputs: Uint8Array, witness: unknown): Record<string, any> {
    const w = witness as ComplianceWitness;
    return {
      sanctions_root: this.bytesToHex(publicInputs.slice(0, 32)),
      wallet_address: w.walletAddress,
      merkle_path: w.merklePath,
      path_indices: w.pathIndices,
    };
  }

  private prepareBalanceThresholdInputs(publicInputs: Uint8Array, witness: unknown): Record<string, any> {
    return {}; // Implement based on circuit requirements
  }

  private prepareAgeVerificationInputs(publicInputs: Uint8Array, witness: unknown): Record<string, any> {
    return {}; // Implement based on circuit requirements
  }

  private prepareKycLevelInputs(publicInputs: Uint8Array, witness: unknown): Record<string, any> {
    return {}; // Implement based on circuit requirements
  }

  /**
   * Encode spending limit inputs
   */
  private encodeSpendingLimitInputs(inputs: SpendingLimitInputs): Uint8Array {
    const amountBytes = this.bigintToBytes(inputs.amount, 32);
    const commitmentBytes = this.hexToBytes(inputs.commitment);
    return new Uint8Array([...amountBytes, ...commitmentBytes]);
  }

  /**
   * Encode compliance inputs
   */
  private encodeComplianceInputs(inputs: ComplianceInputs): Uint8Array {
    const rootBytes = this.hexToBytes(inputs.sanctionsRoot);
    const commitmentBytes = this.hexToBytes(inputs.addressCommitment);
    return new Uint8Array([...rootBytes, ...commitmentBytes]);
  }

  /**
   * Encode threshold inputs
   */
  private encodeThresholdInputs(inputs: { threshold: bigint; commitment: string }): Uint8Array {
    const thresholdBytes = this.bigintToBytes(inputs.threshold, 32);
    const commitmentBytes = this.hexToBytes(inputs.commitment);
    return new Uint8Array([...thresholdBytes, ...commitmentBytes]);
  }

  /**
   * Hash proof for deduplication
   */
  private async hashProof(proof: Uint8Array, publicInputs: Uint8Array): Promise<string> {
    const data = new Uint8Array([...proof, ...publicInputs]);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get proof type index
   */
  private getProofTypeIndex(type: ProofType): number {
    const types: ProofType[] = [
      'spending_limit',
      'compliance',
      'balance_threshold',
      'age_verification',
      'kyc_level',
    ];
    return types.indexOf(type);
  }

  /**
   * Convert bigint to bytes
   */
  private bigintToBytes(value: bigint, length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    let remaining = value;
    for (let i = length - 1; i >= 0; i--) {
      bytes[i] = Number(remaining & BigInt(0xff));
      remaining >>= BigInt(8);
    }
    return bytes;
  }

  /**
   * Convert hex string to bytes
   */
  private hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Generate random bytes as hex
   */
  private generateRandomness(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ============ REPLAY PROTECTION ============

  /**
   * Generate replay protection metadata for a proof
   * 
   * @param validityMs - How long the proof is valid (default: 1 hour)
   * @returns Replay protection metadata
   */
  private generateReplayProtection(validityMs: number = DEFAULT_PROOF_VALIDITY_MS): {
    nonce: string;
    timestamp: number;
    expiresAt: number;
    nullifier: string;
  } {
    // Generate cryptographically secure random nonce
    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    const nonce = bytesToHex(nonceBytes);
    
    const timestamp = Date.now();
    const expiresAt = timestamp + validityMs;
    
    // Generate nullifier from nonce + timestamp
    // Nullifier = H(nonce || timestamp || "sunspot-nullifier-v1")
    const nullifierData = new Uint8Array([
      ...nonceBytes,
      ...new TextEncoder().encode(timestamp.toString()),
      ...new TextEncoder().encode('sunspot-nullifier-v1'),
    ]);
    const nullifier = bytesToHex(sha256(nullifierData));
    
    console.log(`[Sunspot] Generated proof with replay protection: nonce=${nonce.slice(0, 8)}..., expires in ${validityMs}ms`);
    
    return {
      nonce,
      timestamp,
      expiresAt,
      nullifier,
    };
  }

  /**
   * Check if a proof passes replay protection checks
   * 
   * @param proof - Proof to check
   * @returns Verification result
   */
  private checkReplayProtection(proof: ZkProof): VerificationResult {
    const { timestamp, expiresAt, nullifier } = proof.replayProtection;
    const now = Date.now();
    
    // Check 1: Proof not expired
    if (now > expiresAt) {
      console.warn(`[Sunspot] Proof expired: generated at ${new Date(timestamp).toISOString()}, expired at ${new Date(expiresAt).toISOString()}`);
      return {
        valid: false,
        error: `Proof expired at ${new Date(expiresAt).toISOString()}`,
        nullifier,
      };
    }
    
    // Check 2: Timestamp not in future (clock skew tolerance: 5 minutes)
    const maxClockSkew = 5 * 60 * 1000; // 5 minutes
    if (timestamp > now + maxClockSkew) {
      console.warn(`[Sunspot] Proof timestamp in future: ${new Date(timestamp).toISOString()}`);
      return {
        valid: false,
        error: 'Proof timestamp is in the future',
        nullifier,
      };
    }
    
    // Check 3: Nullifier not already used (replay detection)
    if (this.usedNullifiers.has(nullifier)) {
      console.warn(`[Sunspot] Replay attack detected: nullifier ${nullifier.slice(0, 16)}... already used`);
      return {
        valid: false,
        error: 'Proof replay detected - nullifier already used',
        replayDetected: true,
        nullifier,
      };
    }
    
    // All checks passed
    return {
      valid: true,
      nullifier,
    };
  }

  /**
   * Mark a nullifier as used to prevent replay
   * 
   * @param nullifier - Nullifier hash to mark as used
   * @param expiresAt - When this nullifier expires (for cleanup)
   */
  private markNullifierUsed(nullifier: string, expiresAt: number): void {
    this.usedNullifiers.add(nullifier);
    this.nullifierExpiry.set(nullifier, expiresAt);
    
    console.log(`[Sunspot] Nullifier marked as used: ${nullifier.slice(0, 16)}... (expires: ${new Date(expiresAt).toISOString()})`);
  }

  /**
   * Clean up expired nullifiers to save memory
   * 
   * Called periodically to remove nullifiers that have expired.
   */
  private cleanupExpiredNullifiers(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [nullifier, expiresAt] of this.nullifierExpiry.entries()) {
      if (now > expiresAt) {
        this.usedNullifiers.delete(nullifier);
        this.nullifierExpiry.delete(nullifier);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[Sunspot] Cleaned up ${cleanedCount} expired nullifiers. Active: ${this.usedNullifiers.size}`);
    }
  }

  /**
   * Get nullifier registry statistics
   */
  getNullifierStats(): {
    activeNullifiers: number;
    oldestExpiry: number | null;
    newestExpiry: number | null;
  } {
    const expiries = Array.from(this.nullifierExpiry.values());
    
    return {
      activeNullifiers: this.usedNullifiers.size,
      oldestExpiry: expiries.length > 0 ? Math.min(...expiries) : null,
      newestExpiry: expiries.length > 0 ? Math.max(...expiries) : null,
    };
  }

  /**
   * Clear all nullifiers (use with caution - for testing only)
   */
  clearNullifiers(): void {
    const count = this.usedNullifiers.size;
    this.usedNullifiers.clear();
    this.nullifierExpiry.clear();
    console.log(`[Sunspot] Cleared ${count} nullifiers`);
  }
}

// ============ FACTORY ============

let sunspotInstance: SunspotService | null = null;

/**
 * Get Sunspot service instance
 */
export function getSunspotService(config?: Partial<SunspotConfig>): SunspotService {
  if (!sunspotInstance) {
    const rpcUrl = process.env.EXPO_PUBLIC_HELIUS_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    sunspotInstance = new SunspotService({
      connection,
      verifierProgramId: DEFAULT_VERIFIER_PROGRAM_ID,
      ...config,
    });
  }
  return sunspotInstance;
}

/**
 * Check if Sunspot is available
 */
export function isSunspotConfigured(): boolean {
  // Sunspot uses Solana syscalls, so it's available if we have RPC
  return Boolean(process.env.EXPO_PUBLIC_HELIUS_RPC_URL);
}
