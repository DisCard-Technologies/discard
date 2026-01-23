/**
 * Helius DAS (Digital Asset Standard) Client
 *
 * Service for querying NFTs, tokens, and compressed assets on Solana
 * using Helius's DAS API. Provides unified access to all digital asset
 * types with comprehensive metadata.
 *
 * Features:
 * - Single asset retrieval (getAsset)
 * - Wallet portfolio queries (getAssetsByOwner)
 * - Advanced search with filters (searchAssets)
 * - Compressed NFT proof generation (getAssetProof)
 * - Token price data for top 10k tokens
 * - Privacy-preserving routing through Convex backend
 *
 * @see https://docs.helius.dev/das-api
 */

// ============================================================================
// Configuration
// ============================================================================

const HELIUS_API_KEY = process.env.EXPO_PUBLIC_HELIUS_API_KEY || "";
const HELIUS_RPC_URL = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

// ============================================================================
// Privacy Types
// ============================================================================

export type PrivacyLevel = "basic" | "enhanced" | "maximum";

export interface PrivacyOptions {
  /** Route through Convex backend for privacy */
  usePrivateRoute?: boolean;
  /** Privacy level for routing decisions */
  privacyLevel?: PrivacyLevel;
  /** Convex action caller (injected from React component) */
  convexAction?: <T>(args: {
    endpoint: "helius" | "jupiter" | "solana" | "magicblock";
    method: string;
    params: unknown;
    privacyLevel: PrivacyLevel;
  }) => Promise<T>;
}

// ============================================================================
// Types
// ============================================================================

export interface DasAsset {
  id: string;
  interface: string;
  content: {
    $schema?: string;
    json_uri?: string;
    files?: Array<{
      uri: string;
      mime?: string;
      cdn_uri?: string;
    }>;
    metadata: {
      name: string;
      symbol?: string;
      description?: string;
      attributes?: Array<{
        trait_type: string;
        value: string | number;
      }>;
    };
    links?: {
      image?: string;
      animation_url?: string;
      external_url?: string;
    };
  };
  authorities?: Array<{
    address: string;
    scopes: string[];
  }>;
  compression?: {
    eligible: boolean;
    compressed: boolean;
    data_hash?: string;
    creator_hash?: string;
    asset_hash?: string;
    tree?: string;
    seq?: number;
    leaf_id?: number;
  };
  grouping?: Array<{
    group_key: string;
    group_value: string;
  }>;
  royalty?: {
    royalty_model: string;
    target?: string;
    percent: number;
    basis_points: number;
    primary_sale_happened: boolean;
    locked: boolean;
  };
  creators?: Array<{
    address: string;
    share: number;
    verified: boolean;
  }>;
  ownership: {
    frozen: boolean;
    delegated: boolean;
    delegate?: string;
    ownership_model: string;
    owner: string;
  };
  supply?: {
    print_max_supply?: number;
    print_current_supply?: number;
    edition_nonce?: number;
  };
  mutable: boolean;
  burnt: boolean;
  token_info?: {
    symbol?: string;
    balance?: number;
    supply?: number;
    decimals?: number;
    token_program?: string;
    associated_token_address?: string;
    price_info?: {
      price_per_token?: number;
      total_price?: number;
      currency?: string;
    };
  };
}

export interface AssetProof {
  root: string;
  proof: string[];
  node_index: number;
  leaf: string;
  tree_id: string;
}

export interface SearchAssetsParams {
  ownerAddress?: string;
  creatorAddress?: string;
  creatorVerified?: boolean;
  authorityAddress?: string;
  grouping?: [string, string];
  delegate?: string;
  frozen?: boolean;
  supply?: number;
  supplyMint?: string;
  compressed?: boolean;
  compressible?: boolean;
  royaltyTargetType?: "creators" | "fanout" | "single";
  royaltyTarget?: string;
  royaltyAmount?: number;
  burnt?: boolean;
  sortBy?: {
    sortBy: "created" | "updated" | "recent_action" | "none";
    sortDirection?: "asc" | "desc";
  };
  limit?: number;
  page?: number;
  before?: string;
  after?: string;
  jsonUri?: string;
  tokenType?: "fungible" | "nonFungible" | "regularNft" | "compressedNft" | "all";
}

export interface SearchAssetsResult {
  total: number;
  limit: number;
  page: number;
  items: DasAsset[];
}

export interface TokenBalance {
  mint: string;
  symbol?: string;
  name?: string;
  decimals: number;
  balance: number;
  uiBalance: number;
  pricePerToken?: number;
  totalValue?: number;
  logoUri?: string;
}

// ============================================================================
// Helius DAS Service
// ============================================================================

export class HeliusDasService {
  private rpcUrl: string;
  private defaultPrivacyOptions: PrivacyOptions;

  constructor(apiKey?: string, privacyOptions?: PrivacyOptions) {
    this.rpcUrl = apiKey
      ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
      : HELIUS_RPC_URL;
    this.defaultPrivacyOptions = privacyOptions || {};
  }

  /**
   * Set default privacy options for all requests
   */
  setPrivacyOptions(options: PrivacyOptions): void {
    this.defaultPrivacyOptions = { ...this.defaultPrivacyOptions, ...options };
  }

  /**
   * Make an RPC request, optionally routing through Convex for privacy
   */
  private async makeRequest<T>(
    method: string,
    params: unknown,
    options?: PrivacyOptions
  ): Promise<T | null> {
    const mergedOptions = { ...this.defaultPrivacyOptions, ...options };
    const { usePrivateRoute, privacyLevel, convexAction } = mergedOptions;

    // Use private route through Convex if configured
    if (usePrivateRoute && convexAction && privacyLevel !== "basic") {
      try {
        console.log(`[HeliusDAS] Using private route for ${method}`);
        const result = await convexAction<{ result?: T; error?: unknown }>({
          endpoint: "helius",
          method,
          params,
          privacyLevel: privacyLevel || "enhanced",
        });

        if (result.error) {
          console.error(`[HeliusDAS] Private route error:`, result.error);
          return null;
        }

        return result.result || null;
      } catch (error) {
        console.error(`[HeliusDAS] Private route failed, falling back to direct:`, error);
        // Fall through to direct request
      }
    }

    // Direct request
    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: method,
          method,
          params,
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error(`[HeliusDAS] ${method} error:`, data.error);
        return null;
      }

      return data.result;
    } catch (error) {
      console.error(`[HeliusDAS] ${method} failed:`, error);
      return null;
    }
  }

  // ==========================================================================
  // Asset Queries
  // ==========================================================================

  /**
   * Get a single asset by its ID (mint address)
   *
   * @param assetId - Mint address of the asset
   * @param privacyOptions - Optional privacy routing configuration
   */
  async getAsset(
    assetId: string,
    privacyOptions?: PrivacyOptions
  ): Promise<DasAsset | null> {
    console.log("[HeliusDAS] Getting asset:", assetId);
    return this.makeRequest<DasAsset>("getAsset", { id: assetId }, privacyOptions);
  }

  /**
   * Get multiple assets by their IDs
   *
   * @param assetIds - Array of mint addresses
   * @param privacyOptions - Optional privacy routing configuration
   */
  async getAssetBatch(
    assetIds: string[],
    privacyOptions?: PrivacyOptions
  ): Promise<DasAsset[]> {
    console.log("[HeliusDAS] Getting batch of", assetIds.length, "assets");
    const result = await this.makeRequest<DasAsset[]>(
      "getAssetBatch",
      { ids: assetIds },
      privacyOptions
    );
    return result || [];
  }

  /**
   * Get all assets owned by a wallet
   *
   * @param ownerAddress - Wallet address to query
   * @param options - Query options (pagination, sorting, display)
   * @param privacyOptions - Optional privacy routing configuration
   */
  async getAssetsByOwner(
    ownerAddress: string,
    options?: {
      page?: number;
      limit?: number;
      sortBy?: "created" | "updated" | "recent_action";
      sortDirection?: "asc" | "desc";
      displayOptions?: {
        showFungible?: boolean;
        showNativeBalance?: boolean;
        showInscription?: boolean;
        showCollectionMetadata?: boolean;
      };
    },
    privacyOptions?: PrivacyOptions
  ): Promise<SearchAssetsResult> {
    console.log("[HeliusDAS] Getting assets for owner:", ownerAddress);

    const params: Record<string, unknown> = {
      ownerAddress,
      page: options?.page || 1,
      limit: options?.limit || 100,
    };

    if (options?.sortBy) {
      params.sortBy = {
        sortBy: options.sortBy,
        sortDirection: options.sortDirection || "desc",
      };
    }

    if (options?.displayOptions) {
      params.displayOptions = options.displayOptions;
    }

    const result = await this.makeRequest<SearchAssetsResult>(
      "getAssetsByOwner",
      params,
      privacyOptions
    );
    return result || { total: 0, limit: 100, page: 1, items: [] };
  }

  /**
   * Search assets with advanced filters
   *
   * @param params - Search parameters
   * @param privacyOptions - Optional privacy routing configuration
   */
  async searchAssets(
    params: SearchAssetsParams,
    privacyOptions?: PrivacyOptions
  ): Promise<SearchAssetsResult> {
    console.log("[HeliusDAS] Searching assets with params:", params);
    const result = await this.makeRequest<SearchAssetsResult>(
      "searchAssets",
      params,
      privacyOptions
    );
    return result || { total: 0, limit: 100, page: 1, items: [] };
  }

  // ==========================================================================
  // Compressed NFT Support
  // ==========================================================================

  /**
   * Get merkle proof for a compressed asset
   *
   * @param assetId - Mint address of the compressed asset
   * @param privacyOptions - Optional privacy routing configuration
   */
  async getAssetProof(
    assetId: string,
    privacyOptions?: PrivacyOptions
  ): Promise<AssetProof | null> {
    console.log("[HeliusDAS] Getting proof for compressed asset:", assetId);
    return this.makeRequest<AssetProof>("getAssetProof", { id: assetId }, privacyOptions);
  }

  /**
   * Get proofs for multiple compressed assets
   *
   * @param assetIds - Array of mint addresses
   * @param privacyOptions - Optional privacy routing configuration
   */
  async getAssetProofBatch(
    assetIds: string[],
    privacyOptions?: PrivacyOptions
  ): Promise<Map<string, AssetProof>> {
    console.log("[HeliusDAS] Getting proofs for", assetIds.length, "assets");

    const result = await this.makeRequest<Record<string, AssetProof>>(
      "getAssetProofBatch",
      { ids: assetIds },
      privacyOptions
    );

    const proofMap = new Map<string, AssetProof>();
    if (result) {
      for (const [id, proof] of Object.entries(result)) {
        proofMap.set(id, proof);
      }
    }

    return proofMap;
  }

  // ==========================================================================
  // Token Queries
  // ==========================================================================

  /**
   * Get all token balances for a wallet with prices
   *
   * @param ownerAddress - Wallet address to query
   * @param privacyOptions - Optional privacy routing configuration
   */
  async getTokenBalances(
    ownerAddress: string,
    privacyOptions?: PrivacyOptions
  ): Promise<TokenBalance[]> {
    console.log("[HeliusDAS] Getting token balances for:", ownerAddress);

    try {
      // Get fungible tokens with prices
      const result = await this.searchAssets(
        {
          ownerAddress,
          tokenType: "fungible",
          limit: 100,
        },
        privacyOptions
      );

      const balances: TokenBalance[] = result.items
        .filter((asset) => asset.token_info)
        .map((asset) => ({
          mint: asset.id,
          symbol: asset.token_info?.symbol || asset.content?.metadata?.symbol,
          name: asset.content?.metadata?.name,
          decimals: asset.token_info?.decimals || 0,
          balance: asset.token_info?.balance || 0,
          uiBalance: (asset.token_info?.balance || 0) / Math.pow(10, asset.token_info?.decimals || 0),
          pricePerToken: asset.token_info?.price_info?.price_per_token,
          totalValue: asset.token_info?.price_info?.total_price,
          logoUri: asset.content?.links?.image,
        }));

      return balances;
    } catch (error) {
      console.error("[HeliusDAS] getTokenBalances failed:", error);
      return [];
    }
  }

  /**
   * Get NFT collections owned by a wallet
   *
   * @param ownerAddress - Wallet address to query
   * @param privacyOptions - Optional privacy routing configuration
   */
  async getNftCollections(
    ownerAddress: string,
    privacyOptions?: PrivacyOptions
  ): Promise<Map<string, DasAsset[]>> {
    console.log("[HeliusDAS] Getting NFT collections for:", ownerAddress);

    try {
      const result = await this.searchAssets(
        {
          ownerAddress,
          tokenType: "nonFungible",
          limit: 500,
        },
        privacyOptions
      );

      // Group by collection
      const collections = new Map<string, DasAsset[]>();

      for (const asset of result.items) {
        const collection = asset.grouping?.find((g) => g.group_key === "collection");
        const collectionId = collection?.group_value || "uncategorized";

        if (!collections.has(collectionId)) {
          collections.set(collectionId, []);
        }
        collections.get(collectionId)!.push(asset);
      }

      return collections;
    } catch (error) {
      console.error("[HeliusDAS] getNftCollections failed:", error);
      return new Map();
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check if an asset is compressed
   */
  isCompressed(asset: DasAsset): boolean {
    return asset.compression?.compressed || false;
  }

  /**
   * Get the image URL for an asset
   */
  getImageUrl(asset: DasAsset): string | undefined {
    return (
      asset.content?.links?.image ||
      asset.content?.files?.[0]?.cdn_uri ||
      asset.content?.files?.[0]?.uri
    );
  }

  /**
   * Check if Helius API is configured
   */
  isConfigured(): boolean {
    return !!HELIUS_API_KEY;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let heliusDasServiceInstance: HeliusDasService | null = null;

export function getHeliusDasService(): HeliusDasService {
  if (!heliusDasServiceInstance) {
    heliusDasServiceInstance = new HeliusDasService();
  }
  return heliusDasServiceInstance;
}

export default HeliusDasService;
