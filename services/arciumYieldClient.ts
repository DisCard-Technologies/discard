/**
 * Arcium Yield Vault Client
 *
 * Privacy-preserving yield vaults using Arcium MXE for confidential deposits.
 * Users can earn yield without revealing their deposit amounts on-chain.
 *
 * Privacy Architecture:
 * 1. Deposit amounts encrypted via Arcium MPC
 * 2. Yield accrual computed in MXE (encrypted computation)
 * 3. Withdrawals preserve privacy through stealth addresses
 * 4. Position sizes never visible on-chain
 *
 * Vault Types:
 * - Stable yield (USDC/USDT) - Lower risk, 4-8% APY
 * - SOL staking - Medium risk, 6-12% APY
 * - DeFi aggregator - Higher risk, 10-25% APY
 *
 * @see https://docs.arcium.com
 */

import { getArciumMpcService, type EncryptedInput } from "./arciumMpcClient";
import { getShadowWireService, type StealthAddress } from "./shadowWireClient";

// ============================================================================
// Types
// ============================================================================

export type VaultRiskLevel = "low" | "medium" | "high";
export type VaultStatus = "active" | "paused" | "deprecated";

export interface YieldVault {
  /** Vault ID */
  id: string;
  /** Vault name */
  name: string;
  /** Description */
  description: string;
  /** Underlying asset (token mint) */
  asset: string;
  /** Asset symbol */
  assetSymbol: string;
  /** Current APY (percentage) */
  apy: number;
  /** 7-day average APY */
  apy7d: number;
  /** 30-day average APY */
  apy30d: number;
  /** Total value locked (public aggregate, not individual) */
  tvl: bigint;
  /** Risk level */
  riskLevel: VaultRiskLevel;
  /** Vault status */
  status: VaultStatus;
  /** Minimum deposit in base units */
  minDeposit: bigint;
  /** Maximum deposit in base units (0 = unlimited) */
  maxDeposit: bigint;
  /** Withdrawal fee (basis points) */
  withdrawalFeeBps: number;
  /** Lock period in seconds (0 = instant) */
  lockPeriod: number;
  /** Strategy description */
  strategy: string;
  /** Audited by */
  auditedBy?: string[];
  /** Privacy features */
  privacyFeatures: {
    encryptedDeposits: boolean;
    encryptedWithdrawals: boolean;
    stealthAddresses: boolean;
    mpcComputation: boolean;
  };
}

export interface PrivateVaultPosition {
  /** Position ID */
  id: string;
  /** Vault ID */
  vaultId: string;
  /** Encrypted deposit amount */
  encryptedAmount: EncryptedInput;
  /** Encrypted accrued yield */
  encryptedYield: EncryptedInput;
  /** Deposit timestamp */
  depositedAt: number;
  /** Lock expiry (0 = unlocked) */
  lockExpiresAt: number;
  /** Stealth address for withdrawal */
  withdrawalAddress: StealthAddress;
  /** Position status */
  status: "active" | "withdrawing" | "withdrawn";
}

export interface DepositQuote {
  /** Quote ID */
  quoteId: string;
  /** Vault details */
  vault: YieldVault;
  /** Amount to deposit (base units) */
  amount: bigint;
  /** Encrypted amount for on-chain */
  encryptedAmount: EncryptedInput;
  /** Estimated first-year yield */
  estimatedYield: bigint;
  /** Quote expiry */
  expiresAt: number;
  /** Withdrawal stealth address */
  withdrawalAddress: StealthAddress;
}

export interface DepositResult {
  /** Success status */
  success: boolean;
  /** Position ID */
  positionId?: string;
  /** Transaction signature */
  signature?: string;
  /** Privacy metrics */
  privacyMetrics?: {
    amountHidden: boolean;
    positionUnlinkable: boolean;
    yieldPrivate: boolean;
  };
  /** Error message */
  error?: string;
}

export interface WithdrawQuote {
  /** Quote ID */
  quoteId: string;
  /** Position to withdraw from */
  position: PrivateVaultPosition;
  /** Encrypted total (principal + yield) */
  encryptedTotal: EncryptedInput;
  /** Withdrawal fee (encrypted) */
  encryptedFee: EncryptedInput;
  /** Net amount after fee (encrypted) */
  encryptedNetAmount: EncryptedInput;
  /** Destination stealth address */
  destinationAddress: StealthAddress;
  /** Quote expiry */
  expiresAt: number;
}

export interface WithdrawResult {
  /** Success status */
  success: boolean;
  /** Transaction signature */
  signature?: string;
  /** Destination address */
  destinationAddress?: string;
  /** Privacy preserved */
  privacyPreserved?: boolean;
  /** Error message */
  error?: string;
}

export interface VaultStats {
  /** Total positions (count only, not amounts) */
  totalPositions: number;
  /** 24h deposit volume (public aggregate) */
  volume24h: bigint;
  /** Average APY across all vaults */
  averageApy: number;
  /** Total vaults available */
  totalVaults: number;
}

// ============================================================================
// Mock Vault Data
// ============================================================================

const MOCK_VAULTS: YieldVault[] = [
  {
    id: "vault-usdc-stable",
    name: "USDC Stable Yield",
    description: "Low-risk USDC lending across top DeFi protocols",
    asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mint
    assetSymbol: "USDC",
    apy: 5.2,
    apy7d: 5.1,
    apy30d: 5.3,
    tvl: BigInt(15_000_000_000_000), // $15M in base units
    riskLevel: "low",
    status: "active",
    minDeposit: BigInt(10_000_000), // $10 USDC
    maxDeposit: BigInt(0), // Unlimited
    withdrawalFeeBps: 10, // 0.1%
    lockPeriod: 0, // Instant
    strategy: "Allocates across Solend, Marginfi, and Kamino for optimized stable yields",
    auditedBy: ["OtterSec", "Neodyme"],
    privacyFeatures: {
      encryptedDeposits: true,
      encryptedWithdrawals: true,
      stealthAddresses: true,
      mpcComputation: true,
    },
  },
  {
    id: "vault-sol-staking",
    name: "SOL Liquid Staking",
    description: "Earn staking rewards with instant liquidity",
    asset: "So11111111111111111111111111111111111111112", // Native SOL
    assetSymbol: "SOL",
    apy: 7.8,
    apy7d: 7.5,
    apy30d: 8.1,
    tvl: BigInt(250_000_000_000_000), // 250K SOL
    riskLevel: "medium",
    status: "active",
    minDeposit: BigInt(100_000_000), // 0.1 SOL
    maxDeposit: BigInt(0),
    withdrawalFeeBps: 5, // 0.05%
    lockPeriod: 0,
    strategy: "Stakes across Marinade, Jito, and BlazeStake for MEV rewards",
    auditedBy: ["Halborn"],
    privacyFeatures: {
      encryptedDeposits: true,
      encryptedWithdrawals: true,
      stealthAddresses: true,
      mpcComputation: true,
    },
  },
  {
    id: "vault-defi-aggr",
    name: "DeFi Yield Aggregator",
    description: "Automated yield optimization across Solana DeFi",
    asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    assetSymbol: "USDC",
    apy: 12.5,
    apy7d: 11.8,
    apy30d: 13.2,
    tvl: BigInt(8_500_000_000_000), // $8.5M
    riskLevel: "high",
    status: "active",
    minDeposit: BigInt(100_000_000), // $100 USDC
    maxDeposit: BigInt(1_000_000_000_000), // $1M max
    withdrawalFeeBps: 25, // 0.25%
    lockPeriod: 86400, // 24 hours
    strategy: "LP farming, leveraged lending, and delta-neutral strategies",
    auditedBy: ["OtterSec"],
    privacyFeatures: {
      encryptedDeposits: true,
      encryptedWithdrawals: true,
      stealthAddresses: true,
      mpcComputation: true,
    },
  },
  {
    id: "vault-usdt-stable",
    name: "USDT Conservative",
    description: "Ultra-safe USDT yield from overcollateralized lending",
    asset: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT mint
    assetSymbol: "USDT",
    apy: 4.5,
    apy7d: 4.4,
    apy30d: 4.6,
    tvl: BigInt(5_200_000_000_000), // $5.2M
    riskLevel: "low",
    status: "active",
    minDeposit: BigInt(10_000_000), // $10
    maxDeposit: BigInt(0),
    withdrawalFeeBps: 10,
    lockPeriod: 0,
    strategy: "Conservative lending to top-tier protocols only",
    auditedBy: ["Neodyme", "Sec3"],
    privacyFeatures: {
      encryptedDeposits: true,
      encryptedWithdrawals: true,
      stealthAddresses: true,
      mpcComputation: true,
    },
  },
];

// ============================================================================
// Service
// ============================================================================

export class ArciumYieldService {
  private arcium = getArciumMpcService();
  private shadowWire = getShadowWireService();

  // User positions (encrypted, stored locally)
  private positions: Map<string, PrivateVaultPosition> = new Map();

  // Position counter for IDs
  private positionCounter = 0;

  /**
   * Get all available yield vaults
   */
  async getVaults(filter?: {
    riskLevel?: VaultRiskLevel;
    asset?: string;
    minApy?: number;
  }): Promise<YieldVault[]> {
    let vaults = MOCK_VAULTS.filter((v) => v.status === "active");

    if (filter?.riskLevel) {
      vaults = vaults.filter((v) => v.riskLevel === filter.riskLevel);
    }
    if (filter?.asset) {
      vaults = vaults.filter((v) => v.asset === filter.asset);
    }
    if (filter?.minApy !== undefined) {
      vaults = vaults.filter((v) => v.apy >= filter.minApy!);
    }

    return vaults;
  }

  /**
   * Get a specific vault by ID
   */
  async getVault(vaultId: string): Promise<YieldVault | null> {
    return MOCK_VAULTS.find((v) => v.id === vaultId) || null;
  }

  /**
   * Get vault statistics
   */
  async getVaultStats(): Promise<VaultStats> {
    const activeVaults = MOCK_VAULTS.filter((v) => v.status === "active");
    const totalApy = activeVaults.reduce((sum, v) => sum + v.apy, 0);

    return {
      totalPositions: this.positions.size,
      volume24h: BigInt(2_500_000_000_000), // Mock $2.5M
      averageApy: totalApy / activeVaults.length,
      totalVaults: activeVaults.length,
    };
  }

  /**
   * Get a deposit quote with encrypted amount
   */
  async getDepositQuote(
    vaultId: string,
    amount: bigint,
    userAddress: string
  ): Promise<DepositQuote | null> {
    console.log("[ArciumYield] Getting deposit quote:", {
      vault: vaultId,
      amount: amount.toString(),
    });

    try {
      const vault = await this.getVault(vaultId);
      if (!vault) {
        throw new Error("Vault not found");
      }

      if (vault.status !== "active") {
        throw new Error("Vault is not accepting deposits");
      }

      if (amount < vault.minDeposit) {
        throw new Error(`Minimum deposit is ${vault.minDeposit.toString()} base units`);
      }

      if (vault.maxDeposit > 0 && amount > vault.maxDeposit) {
        throw new Error(`Maximum deposit is ${vault.maxDeposit.toString()} base units`);
      }

      // Generate keypair for encryption
      const { privateKey } = await this.arcium.generateKeyPair();

      // Encrypt the deposit amount
      const encryptedAmount = await this.arcium.encryptInput([amount], privateKey);

      // Generate stealth address for future withdrawals
      const withdrawalAddress = await this.shadowWire.generateStealthAddress(userAddress);
      if (!withdrawalAddress) {
        throw new Error("Failed to generate withdrawal address");
      }

      // Calculate estimated first-year yield
      const estimatedYield = (amount * BigInt(Math.floor(vault.apy * 100))) / BigInt(10000);

      const quote: DepositQuote = {
        quoteId: `dep_quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        vault,
        amount,
        encryptedAmount,
        estimatedYield,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        withdrawalAddress,
      };

      console.log("[ArciumYield] Quote generated:", {
        quoteId: quote.quoteId,
        vault: vault.name,
        estimatedYield: `${(Number(estimatedYield) / 1_000_000).toFixed(2)} ${vault.assetSymbol}`,
      });

      return quote;
    } catch (error) {
      console.error("[ArciumYield] Quote failed:", error);
      return null;
    }
  }

  /**
   * Execute a deposit into a yield vault
   */
  async deposit(
    quote: DepositQuote,
    userPrivateKey: Uint8Array
  ): Promise<DepositResult> {
    console.log("[ArciumYield] Executing deposit:", quote.quoteId);

    try {
      // Check quote validity
      if (Date.now() > quote.expiresAt) {
        return { success: false, error: "Quote expired" };
      }

      // In production:
      // 1. Transfer tokens to vault with encrypted amount
      // 2. Vault records encrypted position
      // 3. Generate position receipt

      const positionId = `pos_${++this.positionCounter}_${Date.now()}`;

      // Create encrypted position
      const position: PrivateVaultPosition = {
        id: positionId,
        vaultId: quote.vault.id,
        encryptedAmount: quote.encryptedAmount,
        encryptedYield: await this.arcium.encryptInput([BigInt(0)], userPrivateKey),
        depositedAt: Date.now(),
        lockExpiresAt: quote.vault.lockPeriod > 0
          ? Date.now() + quote.vault.lockPeriod * 1000
          : 0,
        withdrawalAddress: quote.withdrawalAddress,
        status: "active",
      };

      this.positions.set(positionId, position);

      const result: DepositResult = {
        success: true,
        positionId,
        signature: `yield_dep_${positionId}`,
        privacyMetrics: {
          amountHidden: true,
          positionUnlinkable: true,
          yieldPrivate: true,
        },
      };

      console.log("[ArciumYield] Deposit complete:", {
        positionId,
        vault: quote.vault.name,
        privacyMetrics: result.privacyMetrics,
      });

      return result;
    } catch (error) {
      console.error("[ArciumYield] Deposit failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Deposit failed",
      };
    }
  }

  /**
   * Get user's positions
   */
  getPositions(filter?: { vaultId?: string; status?: string }): PrivateVaultPosition[] {
    let positions = Array.from(this.positions.values());

    if (filter?.vaultId) {
      positions = positions.filter((p) => p.vaultId === filter.vaultId);
    }
    if (filter?.status) {
      positions = positions.filter((p) => p.status === filter.status);
    }

    return positions.sort((a, b) => b.depositedAt - a.depositedAt);
  }

  /**
   * Get a specific position
   */
  getPosition(positionId: string): PrivateVaultPosition | undefined {
    return this.positions.get(positionId);
  }

  /**
   * Get withdrawal quote
   */
  async getWithdrawQuote(
    positionId: string,
    userAddress: string
  ): Promise<WithdrawQuote | null> {
    console.log("[ArciumYield] Getting withdrawal quote:", positionId);

    try {
      const position = this.positions.get(positionId);
      if (!position) {
        throw new Error("Position not found");
      }

      if (position.status !== "active") {
        throw new Error("Position is not active");
      }

      // Check lock period
      if (position.lockExpiresAt > 0 && Date.now() < position.lockExpiresAt) {
        const remaining = Math.ceil((position.lockExpiresAt - Date.now()) / 1000 / 60);
        throw new Error(`Position locked for ${remaining} more minutes`);
      }

      const vault = await this.getVault(position.vaultId);
      if (!vault) {
        throw new Error("Vault not found");
      }

      // Generate destination stealth address
      const destinationAddress = await this.shadowWire.generateStealthAddress(userAddress);
      if (!destinationAddress) {
        throw new Error("Failed to generate destination address");
      }

      // In production, these would be computed in MXE
      const { privateKey } = await this.arcium.generateKeyPair();

      const quote: WithdrawQuote = {
        quoteId: `wth_quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        position,
        encryptedTotal: position.encryptedAmount, // Would include yield in production
        encryptedFee: await this.arcium.encryptInput([BigInt(0)], privateKey),
        encryptedNetAmount: position.encryptedAmount,
        destinationAddress,
        expiresAt: Date.now() + 5 * 60 * 1000,
      };

      return quote;
    } catch (error) {
      console.error("[ArciumYield] Withdraw quote failed:", error);
      return null;
    }
  }

  /**
   * Execute withdrawal
   */
  async withdraw(
    quote: WithdrawQuote,
    userPrivateKey: Uint8Array
  ): Promise<WithdrawResult> {
    console.log("[ArciumYield] Executing withdrawal:", quote.quoteId);

    try {
      if (Date.now() > quote.expiresAt) {
        return { success: false, error: "Quote expired" };
      }

      const position = this.positions.get(quote.position.id);
      if (!position) {
        return { success: false, error: "Position not found" };
      }

      // Update position status
      position.status = "withdrawn";

      const result: WithdrawResult = {
        success: true,
        signature: `yield_wth_${quote.quoteId}`,
        destinationAddress: quote.destinationAddress.stealthAddress,
        privacyPreserved: true,
      };

      console.log("[ArciumYield] Withdrawal complete:", {
        positionId: quote.position.id,
        destination: quote.destinationAddress.stealthAddress.slice(0, 8) + "...",
      });

      return result;
    } catch (error) {
      console.error("[ArciumYield] Withdrawal failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Withdrawal failed",
      };
    }
  }

  /**
   * Calculate user's total portfolio value (encrypted)
   * Returns a commitment that can be used for proofs
   */
  async getPortfolioCommitment(
    userPrivateKey: Uint8Array
  ): Promise<{ commitment: string; positionCount: number }> {
    const activePositions = this.getPositions({ status: "active" });

    // In production, this would aggregate encrypted balances in MXE
    const commitment = `portfolio_${Date.now()}_${activePositions.length}`;

    return {
      commitment,
      positionCount: activePositions.length,
    };
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.arcium.isConfigured() && this.shadowWire.isAvailable();
  }

  /**
   * Get risk level color
   */
  getRiskColor(level: VaultRiskLevel): string {
    switch (level) {
      case "low":
        return "#22c55e"; // Green
      case "medium":
        return "#f59e0b"; // Amber
      case "high":
        return "#ef4444"; // Red
      default:
        return "#6b7280"; // Gray
    }
  }

  /**
   * Format APY for display
   */
  formatApy(apy: number): string {
    return `${apy.toFixed(1)}%`;
  }

  /**
   * Format TVL for display
   */
  formatTvl(tvl: bigint, decimals: number = 6): string {
    const value = Number(tvl) / Math.pow(10, decimals);
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let arciumYieldServiceInstance: ArciumYieldService | null = null;

export function getArciumYieldService(): ArciumYieldService {
  if (!arciumYieldServiceInstance) {
    arciumYieldServiceInstance = new ArciumYieldService();
  }
  return arciumYieldServiceInstance;
}

export default ArciumYieldService;
