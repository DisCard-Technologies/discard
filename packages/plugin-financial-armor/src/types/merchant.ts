/**
 * Merchant Registry Types
 *
 * Types for the on-chain merchant registry program
 * that validates Visa/Solana merchants.
 */

import type { PublicKey } from "@solana/web3.js";

/**
 * Risk tiers for merchants
 * 1 = Low risk (auto-approve)
 * 2 = Medium risk (standard checks)
 * 3 = High risk (enhanced verification)
 * 4 = Blocked (always deny)
 */
export type MerchantRiskTier = 1 | 2 | 3 | 4;

/**
 * On-chain merchant record structure
 * Matches the Anchor program account schema
 */
export interface MerchantRecord {
  /** Unique merchant identifier (32 bytes) */
  merchantId: Uint8Array;
  /** Display name (max 64 chars) */
  merchantName: string;
  /** Visa Merchant ID (max 16 chars) */
  visaMid: string;
  /** Merchant Category Code */
  mccCode: number;
  /** Risk tier (1-4) */
  riskTier: MerchantRiskTier;
  /** Whether merchant is active */
  isActive: boolean;
  /** ISO 3166-1 alpha-2 country code */
  countryCode: Uint8Array;
  /** Slot when registered */
  registeredAt: bigint;
  /** Slot when last updated */
  updatedAt: bigint;
  /** Admin authority that registered */
  registeredBy: PublicKey;
  /** Optional IPFS metadata URI */
  metadataUri?: string;
  /** PDA bump seed */
  bump: number;
}

/**
 * Merchant registry global configuration
 */
export interface MerchantRegistryConfig {
  /** Admin authority (multisig) */
  authority: PublicKey;
  /** Total registered merchants */
  totalMerchants: bigint;
  /** Number of blocked merchants */
  blockedCount: bigint;
  /** Last update slot */
  lastUpdated: bigint;
  /** PDA bump seed */
  bump: number;
}

/**
 * Result of merchant validation
 */
export interface MerchantValidationResult {
  /** Whether merchant is valid for transactions */
  isValid: boolean;
  /** Whether merchant is explicitly blocked */
  blocked: boolean;
  /** Merchant risk tier if found */
  riskTier: MerchantRiskTier;
  /** Reason for denial if invalid */
  reason?: string;
  /** On-chain account data if found */
  record?: MerchantRecord;
  /** Time taken to validate (ms) */
  validationTimeMs: number;
}

/**
 * Request to register a new merchant
 */
export interface RegisterMerchantRequest {
  merchantId: string;
  merchantName: string;
  visaMid: string;
  mccCode: number;
  riskTier: MerchantRiskTier;
  countryCode: string;
  metadataUri?: string;
}

/**
 * Request to update merchant status
 */
export interface UpdateMerchantRequest {
  merchantId: string;
  riskTier?: MerchantRiskTier;
  isActive?: boolean;
  metadataUri?: string;
}

/**
 * Merchant Category Code mapping
 */
export interface MCCMapping {
  code: number;
  description: string;
  category: MCCCategory;
  defaultRiskTier: MerchantRiskTier;
}

/**
 * MCC categories for grouping
 */
export type MCCCategory =
  | "airlines"
  | "car_rental"
  | "hotels"
  | "transportation"
  | "utilities"
  | "retail"
  | "food_dining"
  | "entertainment"
  | "professional_services"
  | "government"
  | "financial"
  | "healthcare"
  | "education"
  | "nonprofit"
  | "gambling"
  | "adult"
  | "crypto"
  | "other";

/**
 * Common high-risk MCC codes that require enhanced verification
 */
export const HIGH_RISK_MCC_CODES: number[] = [
  5912, // Drug stores
  5813, // Bars/taverns
  5921, // Package stores (alcohol)
  5993, // Cigar stores
  5999, // Miscellaneous retail
  6010, // Financial institutions - cash
  6011, // ATM
  6012, // Financial institutions
  6051, // Quasi-cash
  6211, // Securities brokers
  6300, // Insurance
  7273, // Dating services
  7801, // Government lotteries
  7802, // Horse/dog racing
  7995, // Gambling
];

/**
 * Blocked MCC codes (always deny)
 */
export const BLOCKED_MCC_CODES: number[] = [
  5966, // Direct marketing - outbound telemarketing
  5967, // Direct marketing - inbound teleservices
  7841, // Video tape rental (often fraud)
];

/**
 * PDA derivation seeds
 */
export const MERCHANT_SEEDS = {
  CONFIG: "merchant_config",
  MERCHANT: "merchant",
} as const;

/**
 * Program ID for merchant registry (to be updated after deployment)
 */
export const MERCHANT_REGISTRY_PROGRAM_ID =
  "MRCHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
