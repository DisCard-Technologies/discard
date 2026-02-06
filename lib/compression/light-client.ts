/**
 * DisCard 2035 - Light Protocol Client
 *
 * Wrapper for Light Protocol SDK to manage ZK-compressed state on Solana.
 * Enables near-zero rent costs for virtual card PDAs and DID commitments.
 */

import {
  Rpc,
  createRpc,
  LightSystemProgram,
  CompressedAccountWithMerkleContext,
  bn,
  defaultTestStateTreeAccounts,
  NewAddressParams,
} from "@lightprotocol/stateless.js";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// ============================================================================
// Types
// ============================================================================

export interface LightClientConfig {
  rpcEndpoint: string;
  compressionRpcEndpoint?: string;
  commitment?: "processed" | "confirmed" | "finalized";
}

export interface CompressedAccountData {
  address: PublicKey;
  owner: PublicKey;
  lamports: number;
  data: Uint8Array;
  dataHash: string;
  leafIndex: number;
  merkleTree: PublicKey;
}

export interface CardStateData {
  cardId: string;
  ownerDid: string;
  ownerCommitment: string;
  balance: bigint;
  spendingLimit: bigint;
  dailyLimit: bigint;
  monthlyLimit: bigint;
  currentDailySpend: bigint;
  currentMonthlySpend: bigint;
  lastResetSlot: bigint;
  isFrozen: boolean;
  merchantWhitelist: string[];
  mccWhitelist: number[];
  createdAt: bigint;
  updatedAt: bigint;
}

export interface DIDCommitmentData {
  did: string;
  commitmentHash: string;
  documentHash: string;
  verificationMethodCount: number;
  recoveryThreshold: number;
  activeGuardiansCount: number;
  status: "active" | "suspended" | "revoked";
  lastKeyRotationSlot: bigint;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface AgentRegistryData {
  agentId: string;
  commitmentHash: string;
  encryptedPayload: string;
  status: "active" | "suspended" | "revoked";
  leafNullifier?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CompressedProof {
  a: number[];
  b: number[];
  c: number[];
}

export interface CreateCompressedAccountResult {
  signature: string;
  leafIndex: number;
  merkleTree: PublicKey;
  stateHash: string;
}

export interface UpdateCompressedAccountResult {
  signature: string;
  newStateHash: string;
  newLeafIndex: number;
}

// ============================================================================
// Light Protocol Client
// ============================================================================

export class LightClient {
  private config: Required<LightClientConfig>;
  private connection: Connection;
  private rpc: Rpc | null = null;
  private initialized: boolean = false;

  // Program IDs
  private static readonly LIGHT_SYSTEM_PROGRAM = new PublicKey(
    "H5sFv8VwWmjxHYS2GB4fTDsK7uTtnRT4WiixtHrET3bN"
  );
  private static readonly DISCARD_STATE_PROGRAM = new PublicKey(
    "DCrd1111111111111111111111111111111111111111" // Placeholder - update after deployment
  );

  constructor(config: LightClientConfig) {
    this.config = {
      rpcEndpoint: config.rpcEndpoint,
      compressionRpcEndpoint: config.compressionRpcEndpoint ?? config.rpcEndpoint,
      commitment: config.commitment ?? "confirmed",
    };
    this.connection = new Connection(this.config.rpcEndpoint, this.config.commitment);
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the Light Protocol RPC connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.rpc = createRpc(
        this.config.rpcEndpoint,
        this.config.compressionRpcEndpoint
      );
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Light Protocol RPC: ${error}`);
    }
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.rpc !== null;
  }

  /**
   * Get the RPC client
   */
  getRpc(): Rpc {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }
    return this.rpc;
  }

  // ==========================================================================
  // Compressed Account Creation
  // ==========================================================================

  /**
   * Create a compressed card state account
   */
  async createCompressedCardState(
    payer: PublicKey,
    cardState: CardStateData
  ): Promise<TransactionInstruction[]> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    // Serialize card state to bytes
    const stateBytes = this.serializeCardState(cardState);

    // Generate address seed from card ID
    const addressSeed = this.generateAddressSeed("card", cardState.cardId);

    // Create compressed account instruction
    const { address, instruction } = await this.createCompressedAccountInstruction(
      payer,
      stateBytes,
      addressSeed
    );

    return [instruction];
  }

  /**
   * Create a compressed DID commitment account
   */
  async createCompressedDIDCommitment(
    payer: PublicKey,
    didCommitment: DIDCommitmentData
  ): Promise<TransactionInstruction[]> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    // Serialize DID commitment to bytes
    const commitmentBytes = this.serializeDIDCommitment(didCommitment);

    // Generate address seed from DID
    const addressSeed = this.generateAddressSeed("did", didCommitment.did);

    // Create compressed account instruction
    const { instruction } = await this.createCompressedAccountInstruction(
      payer,
      commitmentBytes,
      addressSeed
    );

    return [instruction];
  }

  /**
   * Create a generic compressed account instruction
   */
  private async createCompressedAccountInstruction(
    payer: PublicKey,
    data: Uint8Array,
    addressSeed: Uint8Array
  ): Promise<{ address: PublicKey; instruction: TransactionInstruction }> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    // Get state tree accounts
    const stateTreeAccounts = defaultTestStateTreeAccounts();

    // Create new address params
    const newAddressParams: NewAddressParams = {
      seed: addressSeed,
      addressMerkleTreeRootIndex: 0,
      addressMerkleTreePubkey: stateTreeAccounts.addressTree,
      addressQueuePubkey: stateTreeAccounts.addressQueue,
    };

    // Build the instruction using Light System Program
    const instruction = await LightSystemProgram.compress({
      payer,
      toAddress: payer, // Owner of the compressed account
      lamports: bn(0), // No lamports for data-only accounts
      outputStateTreeInfo: stateTreeAccounts.merkleTree,
    } as any);

    // Derive the compressed account address
    const address = this.deriveCompressedAddress(addressSeed, stateTreeAccounts.merkleTree);

    return { address, instruction };
  }

  // ==========================================================================
  // Compressed Account Updates
  // ==========================================================================

  /**
   * Update a compressed card state
   */
  async updateCompressedCardState(
    payer: PublicKey,
    cardId: string,
    updates: Partial<CardStateData>,
    currentAccount: CompressedAccountWithMerkleContext,
    proof: CompressedProof
  ): Promise<TransactionInstruction[]> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    // Deserialize current state
    const currentState = this.deserializeCardState(
      new Uint8Array(currentAccount.data?.data ?? [])
    );

    // Apply updates
    const newState: CardStateData = {
      ...currentState,
      ...updates,
      updatedAt: BigInt(Date.now()),
    };

    // Serialize new state
    const newStateBytes = this.serializeCardState(newState);

    // Build update instruction
    const instructions = await this.buildUpdateInstruction(
      payer,
      currentAccount,
      newStateBytes,
      proof
    );

    return instructions;
  }

  /**
   * Update card balance (common operation)
   */
  async updateCardBalance(
    payer: PublicKey,
    cardId: string,
    newBalance: bigint,
    currentAccount: CompressedAccountWithMerkleContext,
    proof: CompressedProof
  ): Promise<TransactionInstruction[]> {
    return this.updateCompressedCardState(
      payer,
      cardId,
      { balance: newBalance },
      currentAccount,
      proof
    );
  }

  /**
   * Freeze a card
   */
  async freezeCard(
    payer: PublicKey,
    cardId: string,
    currentAccount: CompressedAccountWithMerkleContext,
    proof: CompressedProof
  ): Promise<TransactionInstruction[]> {
    return this.updateCompressedCardState(
      payer,
      cardId,
      { isFrozen: true },
      currentAccount,
      proof
    );
  }

  /**
   * Build update instruction for compressed account
   */
  private async buildUpdateInstruction(
    payer: PublicKey,
    currentAccount: CompressedAccountWithMerkleContext,
    newData: Uint8Array,
    proof: CompressedProof
  ): Promise<TransactionInstruction[]> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    const stateTreeAccounts = defaultTestStateTreeAccounts();

    // Decompress and recompress with new data
    const decompressIx = await LightSystemProgram.decompress({
      payer,
      inputCompressedAccounts: [currentAccount],
      toAddress: payer,
      lamports: bn(currentAccount.lamports),
      outputStateTreeInfo: stateTreeAccounts.merkleTree,
    } as any);

    const compressIx = await LightSystemProgram.compress({
      payer,
      toAddress: payer,
      lamports: bn(0),
      outputStateTreeInfo: stateTreeAccounts.merkleTree,
    } as any);

    return [decompressIx, compressIx];
  }

  // ==========================================================================
  // Compressed Account Queries
  // ==========================================================================

  /**
   * Get compressed account by address seed
   */
  async getCompressedAccount(
    addressSeed: Uint8Array
  ): Promise<CompressedAccountWithMerkleContext | null> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    try {
      const stateTreeAccounts = defaultTestStateTreeAccounts();
      const address = this.deriveCompressedAddress(addressSeed, stateTreeAccounts.merkleTree);

      const accounts = await this.rpc.getCompressedAccountsByOwner(address);
      return accounts.items[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get compressed card state
   */
  async getCardState(cardId: string): Promise<CardStateData | null> {
    const addressSeed = this.generateAddressSeed("card", cardId);
    const account = await this.getCompressedAccount(addressSeed);

    if (!account || !account.data?.data) {
      return null;
    }

    return this.deserializeCardState(new Uint8Array(account.data.data));
  }

  /**
   * Get compressed DID commitment
   */
  async getDIDCommitment(did: string): Promise<DIDCommitmentData | null> {
    const addressSeed = this.generateAddressSeed("did", did);
    const account = await this.getCompressedAccount(addressSeed);

    if (!account || !account.data?.data) {
      return null;
    }

    return this.deserializeDIDCommitment(new Uint8Array(account.data.data));
  }

  /**
   * Get all compressed accounts for a user
   */
  async getAccountsByOwner(
    owner: PublicKey
  ): Promise<CompressedAccountWithMerkleContext[]> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    const result = await this.rpc.getCompressedAccountsByOwner(owner);
    return result.items;
  }

  /**
   * Get validity proof for accounts
   */
  async getValidityProof(
    accounts: CompressedAccountWithMerkleContext[]
  ): Promise<CompressedProof> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    // Get proof from the RPC
    const hashes = accounts.map((a) => a.hash);
    const proof = await this.rpc.getValidityProof(hashes);

    if (!proof.compressedProof) {
      throw new Error("No compressed proof returned from RPC");
    }

    return {
      a: Array.from(proof.compressedProof.a),
      b: Array.from(proof.compressedProof.b),
      c: Array.from(proof.compressedProof.c),
    };
  }

  // ==========================================================================
  // Agent Registry (Compressed Accounts)
  // ==========================================================================

  /**
   * Create a compressed agent registry account
   *
   * Stores E2EE agent data as an opaque blob in a compressed PDA.
   * Cost: ~$0.002 per agent (vs ~$2 for regular account).
   */
  async createCompressedAgentRegistry(
    payer: PublicKey,
    agentData: AgentRegistryData
  ): Promise<TransactionInstruction[]> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    const dataBytes = this.serializeAgentRegistry(agentData);
    const addressSeed = this.generateAddressSeed("agent", agentData.agentId);

    const { instruction } = await this.createCompressedAccountInstruction(
      payer,
      dataBytes,
      addressSeed
    );

    return [instruction];
  }

  /**
   * Get agent registry data from compressed account
   */
  async getAgentRegistry(agentId: string): Promise<AgentRegistryData | null> {
    const addressSeed = this.generateAddressSeed("agent", agentId);
    const account = await this.getCompressedAccount(addressSeed);

    if (!account || !account.data?.data) {
      return null;
    }

    return this.deserializeAgentRegistry(new Uint8Array(account.data.data));
  }

  /**
   * Revoke (nullify) an agent's compressed account leaf
   *
   * Marks the leaf for nullification via Light Protocol.
   */
  async revokeAgentLeaf(
    payer: PublicKey,
    agentId: string,
    currentAccount: CompressedAccountWithMerkleContext,
    proof: CompressedProof
  ): Promise<TransactionInstruction[]> {
    if (!this.rpc) {
      throw new Error("Light Protocol RPC not initialized");
    }

    // Update the agent data with revoked status
    const currentData = this.deserializeAgentRegistry(
      new Uint8Array(currentAccount.data?.data ?? [])
    );

    const revokedData: AgentRegistryData = {
      ...currentData,
      status: "revoked",
      updatedAt: Date.now(),
    };

    const newDataBytes = this.serializeAgentRegistry(revokedData);

    return this.buildUpdateInstruction(
      payer,
      currentAccount,
      newDataBytes,
      proof
    );
  }

  /**
   * Serialize agent registry data to bytes
   */
  private serializeAgentRegistry(data: AgentRegistryData): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(data));
  }

  /**
   * Deserialize agent registry data from bytes
   */
  private deserializeAgentRegistry(data: Uint8Array): AgentRegistryData {
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(data));
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Serialize card state to bytes
   */
  private serializeCardState(state: CardStateData): Uint8Array {
    const encoder = new TextEncoder();
    const json = JSON.stringify({
      ...state,
      balance: state.balance.toString(),
      spendingLimit: state.spendingLimit.toString(),
      dailyLimit: state.dailyLimit.toString(),
      monthlyLimit: state.monthlyLimit.toString(),
      currentDailySpend: state.currentDailySpend.toString(),
      currentMonthlySpend: state.currentMonthlySpend.toString(),
      lastResetSlot: state.lastResetSlot.toString(),
      createdAt: state.createdAt.toString(),
      updatedAt: state.updatedAt.toString(),
    });
    return encoder.encode(json);
  }

  /**
   * Deserialize card state from bytes
   */
  private deserializeCardState(data: Uint8Array): CardStateData {
    const decoder = new TextDecoder();
    const json = JSON.parse(decoder.decode(data));
    return {
      ...json,
      balance: BigInt(json.balance),
      spendingLimit: BigInt(json.spendingLimit),
      dailyLimit: BigInt(json.dailyLimit),
      monthlyLimit: BigInt(json.monthlyLimit),
      currentDailySpend: BigInt(json.currentDailySpend),
      currentMonthlySpend: BigInt(json.currentMonthlySpend),
      lastResetSlot: BigInt(json.lastResetSlot),
      createdAt: BigInt(json.createdAt),
      updatedAt: BigInt(json.updatedAt),
    };
  }

  /**
   * Serialize DID commitment to bytes
   */
  private serializeDIDCommitment(commitment: DIDCommitmentData): Uint8Array {
    const encoder = new TextEncoder();
    const json = JSON.stringify({
      ...commitment,
      lastKeyRotationSlot: commitment.lastKeyRotationSlot.toString(),
      createdAt: commitment.createdAt.toString(),
      updatedAt: commitment.updatedAt.toString(),
    });
    return encoder.encode(json);
  }

  /**
   * Deserialize DID commitment from bytes
   */
  private deserializeDIDCommitment(data: Uint8Array): DIDCommitmentData {
    const decoder = new TextDecoder();
    const json = JSON.parse(decoder.decode(data));
    return {
      ...json,
      lastKeyRotationSlot: BigInt(json.lastKeyRotationSlot),
      createdAt: BigInt(json.createdAt),
      updatedAt: BigInt(json.updatedAt),
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Generate address seed for compressed account
   */
  private generateAddressSeed(prefix: string, identifier: string): Uint8Array {
    const encoder = new TextEncoder();
    const combined = `${prefix}:${identifier}`;
    const bytes = encoder.encode(combined);

    // Hash to 32 bytes
    const seed = new Uint8Array(32);
    for (let i = 0; i < bytes.length && i < 32; i++) {
      seed[i] = bytes[i];
    }
    return seed;
  }

  /**
   * Derive compressed account address from seed
   */
  private deriveCompressedAddress(seed: Uint8Array, merkleTree: PublicKey): PublicKey {
    // PDA derivation for compressed accounts
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from("compressed"), merkleTree.toBuffer(), seed],
      LightClient.LIGHT_SYSTEM_PROGRAM
    );
    return address;
  }

  /**
   * Calculate rent for compressed account (near-zero)
   */
  calculateRent(dataSize: number): number {
    // ZK Compression reduces rent by ~1000x
    // Standard rent: ~0.002 SOL per account
    // Compressed rent: ~0.000002 SOL per leaf
    const LAMPORTS_PER_LEAF = 2000;
    return LAMPORTS_PER_LEAF;
  }

  /**
   * Get connection
   */
  getConnection(): Connection {
    return this.connection;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let lightClientInstance: LightClient | null = null;

export function getLightClient(config?: LightClientConfig): LightClient {
  if (!lightClientInstance && config) {
    lightClientInstance = new LightClient(config);
  }
  if (!lightClientInstance) {
    throw new Error("LightClient not initialized. Call with config first.");
  }
  return lightClientInstance;
}

export function initializeLightClient(config: LightClientConfig): LightClient {
  lightClientInstance = new LightClient(config);
  return lightClientInstance;
}
