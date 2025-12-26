/**
 * Merchant Validator Service
 *
 * Validates merchants against the on-chain PDA registry.
 * Queries Solana for merchant records and checks risk tiers.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import type {
  MerchantRecord,
  MerchantValidationResult,
  MerchantRiskTier,
  UserPolicies,
} from "../types/index.js";
import {
  MERCHANT_REGISTRY_PROGRAM_ID,
  MERCHANT_SEEDS,
  HIGH_RISK_MCC_CODES,
  BLOCKED_MCC_CODES,
} from "../types/index.js";

/**
 * Service for validating merchants against on-chain registry
 */
export class MerchantValidator {
  private connection: Connection;
  private programId: PublicKey;
  private cache: Map<string, { record: MerchantRecord; expiresAt: number }>;
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  constructor(connection: Connection, programId?: string) {
    this.connection = connection;
    this.programId = new PublicKey(programId ?? MERCHANT_REGISTRY_PROGRAM_ID);
    this.cache = new Map();
  }

  /**
   * Validate a merchant for a transaction
   */
  async validate(
    merchantId: string,
    mccCode: string,
    policies: UserPolicies
  ): Promise<MerchantValidationResult> {
    const startTime = Date.now();

    try {
      // Check policy blocklists first (fast path)
      const policyCheck = this.checkPolicyRestrictions(
        merchantId,
        mccCode,
        policies
      );
      if (!policyCheck.allowed) {
        return {
          isValid: false,
          blocked: true,
          riskTier: 4,
          reason: policyCheck.reason,
          validationTimeMs: Date.now() - startTime,
        };
      }

      // Check if MCC is in global blocklist
      const mccNumber = parseInt(mccCode, 10);
      if (BLOCKED_MCC_CODES.includes(mccNumber)) {
        return {
          isValid: false,
          blocked: true,
          riskTier: 4,
          reason: `MCC ${mccCode} is globally blocked`,
          validationTimeMs: Date.now() - startTime,
        };
      }

      // Check cache
      const cached = this.getCachedRecord(merchantId);
      if (cached) {
        return this.evaluateMerchantRecord(cached, startTime);
      }

      // Query on-chain registry
      const record = await this.fetchMerchantRecord(merchantId);

      if (!record) {
        // Merchant not registered - check if high-risk MCC
        if (HIGH_RISK_MCC_CODES.includes(mccNumber)) {
          return {
            isValid: false,
            blocked: false,
            riskTier: 3,
            reason: `Unregistered merchant with high-risk MCC ${mccCode}`,
            validationTimeMs: Date.now() - startTime,
          };
        }

        // For non-high-risk MCCs, allow unregistered merchants with warning
        return {
          isValid: true,
          blocked: false,
          riskTier: 2,
          reason: "Merchant not in registry, proceeding with caution",
          validationTimeMs: Date.now() - startTime,
        };
      }

      // Cache the record
      this.cacheRecord(merchantId, record);

      return this.evaluateMerchantRecord(record, startTime);
    } catch (error) {
      console.error("[MerchantValidator] Error:", error);
      return {
        isValid: false,
        blocked: false,
        riskTier: 3,
        reason: `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
        validationTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Check user policy restrictions
   */
  private checkPolicyRestrictions(
    merchantId: string,
    mccCode: string,
    policies: UserPolicies
  ): { allowed: boolean; reason?: string } {
    // Check merchant blocklist
    if (policies.blockedMerchants?.includes(merchantId)) {
      return { allowed: false, reason: "Merchant is in user blocklist" };
    }

    // Check MCC blocklist
    if (policies.blockedMccCodes?.includes(mccCode)) {
      return { allowed: false, reason: `MCC ${mccCode} is blocked by user` };
    }

    // Check merchant locking (whitelist mode)
    if (policies.merchantLocking) {
      if (
        !policies.allowedMerchants ||
        !policies.allowedMerchants.includes(merchantId)
      ) {
        return {
          allowed: false,
          reason: "Merchant not in user whitelist (locking enabled)",
        };
      }
    }

    // Check MCC allowlist if defined
    if (
      policies.allowedMccCodes &&
      policies.allowedMccCodes.length > 0 &&
      !policies.allowedMccCodes.includes(mccCode)
    ) {
      return {
        allowed: false,
        reason: `MCC ${mccCode} not in user allowed list`,
      };
    }

    return { allowed: true };
  }

  /**
   * Fetch merchant record from on-chain registry
   */
  private async fetchMerchantRecord(
    merchantId: string
  ): Promise<MerchantRecord | null> {
    try {
      // Derive PDA for merchant
      const merchantIdBytes = this.padMerchantId(merchantId);
      const [merchantPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(MERCHANT_SEEDS.MERCHANT), merchantIdBytes],
        this.programId
      );

      // Fetch account
      const accountInfo = await this.connection.getAccountInfo(merchantPda);

      if (!accountInfo || !accountInfo.data) {
        return null;
      }

      // Deserialize account data
      return this.deserializeMerchantRecord(accountInfo.data);
    } catch (error) {
      console.error("[MerchantValidator] Fetch error:", error);
      return null;
    }
  }

  /**
   * Pad merchant ID to 32 bytes
   */
  private padMerchantId(merchantId: string): Buffer {
    const buffer = Buffer.alloc(32);
    const idBytes = Buffer.from(merchantId, "utf-8");
    idBytes.copy(buffer, 0, 0, Math.min(idBytes.length, 32));
    return buffer;
  }

  /**
   * Deserialize merchant record from account data
   */
  private deserializeMerchantRecord(data: Buffer): MerchantRecord {
    let offset = 8; // Skip discriminator

    // merchantId (32 bytes)
    const merchantId = new Uint8Array(data.slice(offset, offset + 32));
    offset += 32;

    // merchantName (string with length prefix)
    const merchantNameLen = data.readUInt32LE(offset);
    offset += 4;
    const merchantName = data
      .slice(offset, offset + merchantNameLen)
      .toString("utf-8");
    offset += merchantNameLen;

    // visaMid (string with length prefix)
    const visaMidLen = data.readUInt32LE(offset);
    offset += 4;
    const visaMid = data.slice(offset, offset + visaMidLen).toString("utf-8");
    offset += visaMidLen;

    // mccCode (u16)
    const mccCode = data.readUInt16LE(offset);
    offset += 2;

    // riskTier (u8)
    const riskTier = data.readUInt8(offset) as MerchantRiskTier;
    offset += 1;

    // isActive (bool)
    const isActive = data.readUInt8(offset) === 1;
    offset += 1;

    // countryCode (2 bytes)
    const countryCode = new Uint8Array(data.slice(offset, offset + 2));
    offset += 2;

    // registeredAt (i64)
    const registeredAt = data.readBigInt64LE(offset);
    offset += 8;

    // updatedAt (i64)
    const updatedAt = data.readBigInt64LE(offset);
    offset += 8;

    // registeredBy (32 bytes pubkey)
    const registeredBy = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // metadataUri (optional string)
    const hasMetadata = data.readUInt8(offset) === 1;
    offset += 1;
    let metadataUri: string | undefined;
    if (hasMetadata) {
      const metadataLen = data.readUInt32LE(offset);
      offset += 4;
      metadataUri = data.slice(offset, offset + metadataLen).toString("utf-8");
      offset += metadataLen;
    }

    // bump (u8)
    const bump = data.readUInt8(offset);

    return {
      merchantId,
      merchantName,
      visaMid,
      mccCode,
      riskTier,
      isActive,
      countryCode,
      registeredAt,
      updatedAt,
      registeredBy,
      metadataUri,
      bump,
    };
  }

  /**
   * Evaluate merchant record and return validation result
   */
  private evaluateMerchantRecord(
    record: MerchantRecord,
    startTime: number
  ): MerchantValidationResult {
    // Check if merchant is active
    if (!record.isActive) {
      return {
        isValid: false,
        blocked: true,
        riskTier: record.riskTier,
        reason: "Merchant is inactive in registry",
        record,
        validationTimeMs: Date.now() - startTime,
      };
    }

    // Check risk tier (4 = blocked)
    if (record.riskTier === 4) {
      return {
        isValid: false,
        blocked: true,
        riskTier: 4,
        reason: "Merchant is in blocked risk tier",
        record,
        validationTimeMs: Date.now() - startTime,
      };
    }

    return {
      isValid: true,
      blocked: false,
      riskTier: record.riskTier,
      record,
      validationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get cached merchant record if not expired
   */
  private getCachedRecord(merchantId: string): MerchantRecord | null {
    const cached = this.cache.get(merchantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.record;
    }
    if (cached) {
      this.cache.delete(merchantId);
    }
    return null;
  }

  /**
   * Cache a merchant record
   */
  private cacheRecord(merchantId: string, record: MerchantRecord): void {
    this.cache.set(merchantId, {
      record,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses for this
    };
  }
}
