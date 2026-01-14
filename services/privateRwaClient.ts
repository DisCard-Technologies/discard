/**
 * Private RWA (Real World Asset) Purchase Client
 *
 * Privacy-preserving purchases of tokenized real-world assets including:
 * - Gift cards
 * - Prepaid cards
 * - Vouchers
 * - Digital goods
 *
 * Privacy Architecture:
 * 1. User's purchase intent is encrypted via Arcium
 * 2. Payment amount is hidden using confidential computation
 * 3. RWA token/code is delivered to stealth address
 * 4. No link between user identity and purchase
 *
 * Combines:
 * - Anoncoin for confidential swaps
 * - Arcium MPC for encrypted amounts
 * - ShadowWire for stealth delivery
 *
 * @see https://docs.arcium.com
 */

import { getArciumMpcService, type EncryptedInput } from "./arciumMpcClient";
import { getAnoncoinSwapService } from "./anoncoinSwapClient";
import { getShadowWireService, type StealthAddress } from "./shadowWireClient";
import { getPrivacyCashService } from "./privacyCashClient";

// ============================================================================
// Types
// ============================================================================

export interface RwaProduct {
  /** Product ID */
  id: string;
  /** Product type */
  type: "gift_card" | "prepaid_card" | "voucher" | "digital_good";
  /** Brand/merchant name */
  brand: string;
  /** Product name */
  name: string;
  /** Available denominations in cents */
  denominations: number[];
  /** Fixed amount or variable */
  isVariable: boolean;
  /** Minimum amount (if variable) */
  minAmount?: number;
  /** Maximum amount (if variable) */
  maxAmount?: number;
  /** Discount percentage (if any) */
  discountPct?: number;
  /** Accepted payment tokens */
  acceptedTokens: string[];
  /** Delivery method */
  deliveryMethod: "instant" | "email" | "stealth_address";
  /** Product image URL */
  imageUrl?: string;
  /** Whether product is active */
  isActive: boolean;
}

export interface PrivateRwaPurchaseRequest {
  /** Product to purchase */
  productId: string;
  /** Amount in cents (will be encrypted) */
  amount: number;
  /** User's wallet address */
  userAddress: string;
  /** Payment token mint */
  paymentToken: string;
  /** Use shielded balance */
  useShieldedBalance?: boolean;
  /** Delivery stealth address */
  deliveryStealthAddress?: string;
}

export interface PrivateRwaPurchaseQuote {
  /** Quote ID */
  quoteId: string;
  /** Product details */
  product: RwaProduct;
  /** Encrypted amount */
  encryptedAmount: EncryptedInput;
  /** Total cost in payment token (base units) */
  totalCostBaseUnits: bigint;
  /** Discount applied */
  discountApplied: number;
  /** Quote expiry */
  expiresAt: number;
  /** Delivery stealth address */
  deliveryAddress: StealthAddress;
}

export interface RwaPurchaseResult {
  /** Success status */
  success: boolean;
  /** Purchase ID */
  purchaseId?: string;
  /** Transaction signature */
  signature?: string;
  /** Delivery info (encrypted) */
  deliveryInfo?: {
    /** Where the RWA was delivered */
    deliveryAddress: string;
    /** Code/PIN (encrypted with user's key) */
    encryptedCode?: string;
    /** Expiry date for code */
    expiresAt?: number;
  };
  /** Privacy metrics */
  privacyMetrics?: {
    amountHidden: boolean;
    recipientHidden: boolean;
    purchaseUnlinkable: boolean;
  };
  /** Error message */
  error?: string;
}

export interface RwaRedemption {
  /** Redemption ID */
  id: string;
  /** Product type */
  productType: string;
  /** Brand */
  brand: string;
  /** Decrypted code/PIN */
  code?: string;
  /** Redemption URL */
  redemptionUrl?: string;
  /** Barcode data */
  barcodeData?: string;
  /** Expiry */
  expiresAt?: number;
  /** Status */
  status: "active" | "redeemed" | "expired";
}

// ============================================================================
// Mock Product Catalog
// ============================================================================

const MOCK_RWA_CATALOG: RwaProduct[] = [
  {
    id: "amazon-gc",
    type: "gift_card",
    brand: "Amazon",
    name: "Amazon Gift Card",
    denominations: [1000, 2500, 5000, 10000], // $10, $25, $50, $100
    isVariable: true,
    minAmount: 500,
    maxAmount: 50000,
    discountPct: 2,
    acceptedTokens: ["USDC", "SOL"],
    deliveryMethod: "stealth_address",
    imageUrl: "https://cdn.example.com/amazon-gc.png",
    isActive: true,
  },
  {
    id: "visa-prepaid",
    type: "prepaid_card",
    brand: "Visa",
    name: "Visa Prepaid Card",
    denominations: [5000, 10000, 25000],
    isVariable: false,
    discountPct: 0,
    acceptedTokens: ["USDC"],
    deliveryMethod: "stealth_address",
    imageUrl: "https://cdn.example.com/visa-prepaid.png",
    isActive: true,
  },
  {
    id: "steam-gc",
    type: "gift_card",
    brand: "Steam",
    name: "Steam Wallet Code",
    denominations: [2000, 5000, 10000],
    isVariable: false,
    discountPct: 3,
    acceptedTokens: ["USDC", "SOL"],
    deliveryMethod: "instant",
    imageUrl: "https://cdn.example.com/steam-gc.png",
    isActive: true,
  },
  {
    id: "uber-gc",
    type: "gift_card",
    brand: "Uber",
    name: "Uber Gift Card",
    denominations: [2500, 5000, 10000],
    isVariable: true,
    minAmount: 1000,
    maxAmount: 20000,
    discountPct: 1,
    acceptedTokens: ["USDC"],
    deliveryMethod: "stealth_address",
    imageUrl: "https://cdn.example.com/uber-gc.png",
    isActive: true,
  },
];

// ============================================================================
// Service
// ============================================================================

export class PrivateRwaService {
  private arcium = getArciumMpcService();
  private anoncoin = getAnoncoinSwapService();
  private shadowWire = getShadowWireService();
  private privacyCash = getPrivacyCashService();

  // User's encrypted purchase history
  private purchaseHistory: Map<string, RwaPurchaseResult> = new Map();
  private redemptions: Map<string, RwaRedemption> = new Map();

  /**
   * Get available RWA products
   */
  async getCatalog(filter?: {
    type?: RwaProduct["type"];
    brand?: string;
    acceptsToken?: string;
  }): Promise<RwaProduct[]> {
    let products = MOCK_RWA_CATALOG.filter((p) => p.isActive);

    if (filter?.type) {
      products = products.filter((p) => p.type === filter.type);
    }
    if (filter?.brand) {
      products = products.filter((p) =>
        p.brand.toLowerCase().includes(filter.brand!.toLowerCase())
      );
    }
    if (filter?.acceptsToken) {
      products = products.filter((p) =>
        p.acceptedTokens.includes(filter.acceptsToken!)
      );
    }

    return products;
  }

  /**
   * Get a specific product by ID
   */
  async getProduct(productId: string): Promise<RwaProduct | null> {
    return MOCK_RWA_CATALOG.find((p) => p.id === productId) || null;
  }

  /**
   * Get a private purchase quote
   *
   * Encrypts the purchase amount and prepares stealth delivery address.
   */
  async getPrivatePurchaseQuote(
    request: PrivateRwaPurchaseRequest
  ): Promise<PrivateRwaPurchaseQuote | null> {
    console.log("[PrivateRWA] Getting purchase quote:", {
      product: request.productId,
      amount: `$${(request.amount / 100).toFixed(2)}`,
    });

    try {
      // 1. Get product
      const product = await this.getProduct(request.productId);
      if (!product) {
        throw new Error("Product not found");
      }

      // 2. Validate amount
      if (product.isVariable) {
        if (product.minAmount && request.amount < product.minAmount) {
          throw new Error(`Minimum amount is $${(product.minAmount / 100).toFixed(2)}`);
        }
        if (product.maxAmount && request.amount > product.maxAmount) {
          throw new Error(`Maximum amount is $${(product.maxAmount / 100).toFixed(2)}`);
        }
      } else if (!product.denominations.includes(request.amount)) {
        throw new Error("Invalid denomination");
      }

      // 3. Generate keypair for encryption
      const { privateKey } = await this.arcium.generateKeyPair();

      // 4. Encrypt the amount
      const encryptedAmount = await this.arcium.encryptInput(
        [BigInt(request.amount)],
        privateKey
      );

      // 5. Generate stealth delivery address
      const deliveryAddress = await this.shadowWire.generateStealthAddress(
        request.userAddress
      );

      if (!deliveryAddress) {
        throw new Error("Failed to generate delivery address");
      }

      // 6. Calculate total cost (with discount)
      const discount = product.discountPct
        ? Math.floor((request.amount * product.discountPct) / 100)
        : 0;
      const finalAmount = request.amount - discount;

      // Convert to base units (USDC has 6 decimals)
      const totalCostBaseUnits = BigInt(finalAmount * 10000); // cents to USDC base units

      const quote: PrivateRwaPurchaseQuote = {
        quoteId: `rwa_quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        product,
        encryptedAmount,
        totalCostBaseUnits,
        discountApplied: discount,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute expiry
        deliveryAddress,
      };

      console.log("[PrivateRWA] Quote generated:", {
        quoteId: quote.quoteId,
        discount: `$${(discount / 100).toFixed(2)}`,
        total: `$${(finalAmount / 100).toFixed(2)}`,
      });

      return quote;
    } catch (error) {
      console.error("[PrivateRWA] Quote failed:", error);
      return null;
    }
  }

  /**
   * Execute a private RWA purchase
   *
   * Flow:
   * 1. Pay from shielded balance or via confidential swap
   * 2. Receive encrypted RWA code at stealth address
   * 3. Decrypt code with user's key
   */
  async executePurchase(
    quote: PrivateRwaPurchaseQuote,
    userPrivateKey: Uint8Array,
    payFromShieldedBalance: boolean = true
  ): Promise<RwaPurchaseResult> {
    console.log("[PrivateRWA] Executing purchase:", quote.quoteId);

    try {
      // Check quote validity
      if (Date.now() > quote.expiresAt) {
        return {
          success: false,
          error: "Quote expired",
        };
      }

      // In production flow:
      // 1. Verify payment (shielded balance or confidential swap)
      // 2. Purchase RWA from vendor API
      // 3. Encrypt code with user's public key
      // 4. Deliver to stealth address

      const purchaseId = `rwa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Mock encrypted code (would be real vendor code in production)
      const mockCode = this.generateMockCode(quote.product.type);

      // Encrypt the code with user's key
      const encryptedCode = await this.encryptCode(mockCode, userPrivateKey);

      const result: RwaPurchaseResult = {
        success: true,
        purchaseId,
        signature: `rwa_tx_${purchaseId}`,
        deliveryInfo: {
          deliveryAddress: quote.deliveryAddress.publicAddress,
          encryptedCode,
          expiresAt: quote.product.type === "gift_card" ? undefined : Date.now() + 365 * 24 * 60 * 60 * 1000,
        },
        privacyMetrics: {
          amountHidden: true,
          recipientHidden: true,
          purchaseUnlinkable: true,
        },
      };

      // Store in history
      this.purchaseHistory.set(purchaseId, result);

      // Create redemption entry
      const redemption: RwaRedemption = {
        id: purchaseId,
        productType: quote.product.type,
        brand: quote.product.brand,
        code: mockCode, // In production, would be decrypted on demand
        redemptionUrl: this.getRedemptionUrl(quote.product),
        status: "active",
        expiresAt: result.deliveryInfo?.expiresAt,
      };
      this.redemptions.set(purchaseId, redemption);

      console.log("[PrivateRWA] Purchase complete:", {
        purchaseId,
        brand: quote.product.brand,
        deliveredTo: quote.deliveryAddress.publicAddress.slice(0, 8) + "...",
      });

      return result;
    } catch (error) {
      console.error("[PrivateRWA] Purchase failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Purchase failed",
      };
    }
  }

  /**
   * Get user's redemption codes
   */
  async getRedemptions(filter?: {
    status?: RwaRedemption["status"];
    productType?: string;
  }): Promise<RwaRedemption[]> {
    let redemptions = Array.from(this.redemptions.values());

    if (filter?.status) {
      redemptions = redemptions.filter((r) => r.status === filter.status);
    }
    if (filter?.productType) {
      redemptions = redemptions.filter((r) => r.productType === filter.productType);
    }

    return redemptions.sort((a, b) => {
      // Active first, then by expiry
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return (b.expiresAt || 0) - (a.expiresAt || 0);
    });
  }

  /**
   * Mark redemption as used
   */
  async markRedeemed(redemptionId: string): Promise<boolean> {
    const redemption = this.redemptions.get(redemptionId);
    if (!redemption) return false;

    redemption.status = "redeemed";
    console.log("[PrivateRWA] Marked as redeemed:", redemptionId);
    return true;
  }

  /**
   * Decrypt a code for viewing
   */
  async decryptCode(
    encryptedCode: string,
    userPrivateKey: Uint8Array
  ): Promise<string | null> {
    try {
      // In production, would use actual decryption
      // For now, return mock code
      return "MOCK-CODE-XXXX";
    } catch (error) {
      console.error("[PrivateRWA] Decryption failed:", error);
      return null;
    }
  }

  /**
   * Check if private RWA purchases are available
   */
  isAvailable(): boolean {
    return this.arcium.isConfigured() && this.shadowWire.isAvailable();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private generateMockCode(productType: string): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";

    switch (productType) {
      case "gift_card":
        // Format: XXXX-XXXX-XXXX-XXXX
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            code += chars[Math.floor(Math.random() * chars.length)];
          }
          if (i < 3) code += "-";
        }
        break;
      case "prepaid_card":
        // Format: 16 digits + 4 digit PIN
        for (let i = 0; i < 16; i++) {
          code += Math.floor(Math.random() * 10).toString();
        }
        code += " PIN: ";
        for (let i = 0; i < 4; i++) {
          code += Math.floor(Math.random() * 10).toString();
        }
        break;
      default:
        // Generic: XXXX-XXXX-XXXX
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 4; j++) {
            code += chars[Math.floor(Math.random() * chars.length)];
          }
          if (i < 2) code += "-";
        }
    }

    return code;
  }

  private async encryptCode(code: string, privateKey: Uint8Array): Promise<string> {
    // In production, encrypt with user's public key
    // For demo, just base64 encode
    return Buffer.from(code).toString("base64");
  }

  private getRedemptionUrl(product: RwaProduct): string | undefined {
    const urls: Record<string, string> = {
      Amazon: "https://www.amazon.com/gc/redeem",
      Steam: "https://store.steampowered.com/account/redeemwalletcode",
      Uber: "https://gift.uber.com/redeem",
    };
    return urls[product.brand];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let privateRwaServiceInstance: PrivateRwaService | null = null;

export function getPrivateRwaService(): PrivateRwaService {
  if (!privateRwaServiceInstance) {
    privateRwaServiceInstance = new PrivateRwaService();
  }
  return privateRwaServiceInstance;
}

export default PrivateRwaService;
