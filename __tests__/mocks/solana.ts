/**
 * Solana RPC Mock
 *
 * Mocks @solana/web3.js for testing Solana blockchain operations.
 */

// Mock Keypairs for testing
const mockKeypairs = new Map<string, { publicKey: string; secretKey: Uint8Array }>();

// Generate deterministic mock keypair
const generateMockKeypair = (seed: number = 0) => {
  const secretKey = new Uint8Array(64).fill(seed);
  const publicKey = `mock_pubkey_${seed}_${'1'.repeat(32)}`.slice(0, 44);
  return { publicKey, secretKey };
};

// Pre-generate some test keypairs
for (let i = 0; i < 10; i++) {
  const kp = generateMockKeypair(i);
  mockKeypairs.set(kp.publicKey, kp);
}

// ============================================================================
// Mock Connection
// ============================================================================

export const mockConnection = {
  getLatestBlockhash: jest.fn(async () => ({
    blockhash: 'mock_blockhash_' + Date.now(),
    lastValidBlockHeight: 123456789,
  })),
  getBalance: jest.fn(async (publicKey: any) => 1000000000), // 1 SOL
  getTokenAccountBalance: jest.fn(async (address: any) => ({
    value: {
      amount: '1000000', // 1 USDC (6 decimals)
      decimals: 6,
      uiAmount: 1,
      uiAmountString: '1',
    },
  })),
  getAccountInfo: jest.fn(async (publicKey: any) => ({
    data: Buffer.alloc(0),
    executable: false,
    lamports: 1000000000,
    owner: 'mock_owner_pubkey',
    rentEpoch: 0,
  })),
  sendTransaction: jest.fn(async (transaction: any, signers?: any[]) => {
    return 'mock_signature_' + Date.now();
  }),
  confirmTransaction: jest.fn(async (signature: any) => ({
    value: { err: null },
  })),
  sendRawTransaction: jest.fn(async (rawTransaction: any) => {
    return 'mock_signature_' + Date.now();
  }),
  getSignatureStatus: jest.fn(async (signature: any) => ({
    value: {
      slot: 123456,
      confirmations: 32,
      err: null,
      confirmationStatus: 'confirmed',
    },
  })),
  getMinimumBalanceForRentExemption: jest.fn(async (dataLength: number) => {
    return 2039280; // Standard rent exemption
  }),
  getRecentPrioritizationFees: jest.fn(async () => [
    { slot: 123456, prioritizationFee: 1000 },
  ]),
  simulateTransaction: jest.fn(async (transaction: any) => ({
    value: {
      err: null,
      logs: ['Program log: Success'],
      accounts: null,
      unitsConsumed: 200000,
    },
  })),
  getProgramAccounts: jest.fn(async () => []),
  getTokenAccountsByOwner: jest.fn(async () => ({
    value: [],
  })),
};

// ============================================================================
// Mock PublicKey
// ============================================================================

export class MockPublicKey {
  private _key: string;
  private _bytes: Uint8Array;

  constructor(value: string | Uint8Array | number[]) {
    if (typeof value === 'string') {
      this._key = value;
      this._bytes = new Uint8Array(32).fill(0);
    } else {
      this._bytes = new Uint8Array(value);
      this._key = 'mock_pubkey_' + Array.from(this._bytes.slice(0, 8)).join('');
    }
  }

  static findProgramAddressSync(seeds: Buffer[], programId: MockPublicKey): [MockPublicKey, number] {
    const seedStr = seeds.map(s => s.toString('hex')).join('_');
    return [new MockPublicKey(`pda_${seedStr}_${programId.toBase58()}`), 255];
  }

  static createWithSeed(fromPublicKey: MockPublicKey, seed: string, programId: MockPublicKey): MockPublicKey {
    return new MockPublicKey(`seed_${fromPublicKey.toBase58()}_${seed}_${programId.toBase58()}`);
  }

  equals(other: MockPublicKey): boolean {
    return this._key === other._key;
  }

  toBase58(): string {
    return this._key;
  }

  toString(): string {
    return this._key;
  }

  toBytes(): Uint8Array {
    return this._bytes;
  }

  toBuffer(): Buffer {
    return Buffer.from(this._bytes);
  }
}

// ============================================================================
// Mock Keypair
// ============================================================================

export class MockKeypair {
  publicKey: MockPublicKey;
  secretKey: Uint8Array;

  constructor() {
    const seed = Math.floor(Math.random() * 1000000);
    this.secretKey = new Uint8Array(64).fill(0).map((_, i) => (seed + i) % 256);
    this.publicKey = new MockPublicKey(`keypair_${seed}`);
  }

  static generate(): MockKeypair {
    return new MockKeypair();
  }

  static fromSeed(seed: Uint8Array): MockKeypair {
    const kp = new MockKeypair();
    kp.secretKey = new Uint8Array([...seed, ...new Uint8Array(32).fill(0)]);
    kp.publicKey = new MockPublicKey(`from_seed_${Array.from(seed.slice(0, 8)).join('')}`);
    return kp;
  }

  static fromSecretKey(secretKey: Uint8Array): MockKeypair {
    const kp = new MockKeypair();
    kp.secretKey = secretKey;
    kp.publicKey = new MockPublicKey(`from_secret_${Array.from(secretKey.slice(0, 8)).join('')}`);
    return kp;
  }
}

// ============================================================================
// Mock Transaction
// ============================================================================

export class MockTransaction {
  instructions: any[] = [];
  recentBlockhash: string | null = null;
  feePayer: MockPublicKey | null = null;
  signatures: any[] = [];

  add(...items: any[]): this {
    this.instructions.push(...items);
    return this;
  }

  sign(...signers: MockKeypair[]): void {
    this.signatures = signers.map(s => ({
      publicKey: s.publicKey,
      signature: new Uint8Array(64).fill(1),
    }));
  }

  serialize(): Buffer {
    return Buffer.from(JSON.stringify({
      instructions: this.instructions,
      recentBlockhash: this.recentBlockhash,
      feePayer: this.feePayer?.toBase58(),
    }));
  }

  static from(buffer: Buffer): MockTransaction {
    return new MockTransaction();
  }
}

// ============================================================================
// Mock Constants
// ============================================================================

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const mockSystemProgram = {
  programId: new MockPublicKey('11111111111111111111111111111111'),
  transfer: jest.fn(() => ({
    keys: [],
    programId: new MockPublicKey('11111111111111111111111111111111'),
    data: Buffer.alloc(0),
  })),
  createAccount: jest.fn(() => ({
    keys: [],
    programId: new MockPublicKey('11111111111111111111111111111111'),
    data: Buffer.alloc(0),
  })),
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Set mock balance for testing
 */
export const setMockBalance = (balance: number) => {
  mockConnection.getBalance.mockResolvedValue(balance);
};

/**
 * Set mock token balance for testing
 */
export const setMockTokenBalance = (amount: string, decimals: number = 6) => {
  mockConnection.getTokenAccountBalance.mockResolvedValue({
    value: {
      amount,
      decimals,
      uiAmount: parseInt(amount) / Math.pow(10, decimals),
      uiAmountString: (parseInt(amount) / Math.pow(10, decimals)).toString(),
    },
  });
};

/**
 * Simulate transaction failure
 */
export const simulateTransactionFailure = (error: string = 'Transaction failed') => {
  mockConnection.sendTransaction.mockRejectedValueOnce(new Error(error));
  mockConnection.sendRawTransaction.mockRejectedValueOnce(new Error(error));
};

/**
 * Simulate confirmation failure
 */
export const simulateConfirmationFailure = () => {
  mockConnection.confirmTransaction.mockResolvedValueOnce({
    value: { err: { InstructionError: [0, 'Custom error'] } as any },
  });
};

/**
 * Reset all Solana mocks
 */
export const resetSolanaMocks = () => {
  Object.values(mockConnection).forEach(mock => {
    if (jest.isMockFunction(mock)) {
      mock.mockClear();
    }
  });
};

// ============================================================================
// Jest Mocks
// ============================================================================

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(() => mockConnection),
  PublicKey: MockPublicKey,
  Keypair: MockKeypair,
  Transaction: MockTransaction,
  SystemProgram: mockSystemProgram,
  LAMPORTS_PER_SOL,
  clusterApiUrl: jest.fn((cluster: string) => `https://api.${cluster}.solana.com`),
  sendAndConfirmTransaction: jest.fn(async () => 'mock_signature_' + Date.now()),
}));
