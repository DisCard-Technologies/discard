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

  constructor(apiKey?: string) {
    this.rpcUrl = apiKey
      ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
      : HELIUS_RPC_URL;
  }

  // ==========================================================================
  // Asset Queries
  // ==========================================================================

  /**
   * Get a single asset by its ID (mint address)
   */
  async getAsset(assetId: string): Promise<DasAsset | null> {
    console.log("[HeliusDAS] Getting asset:", assetId);

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-asset",
          method: "getAsset",
          params: { id: assetId },
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("[HeliusDAS] getAsset error:", data.error);
        return null;
      }

      return data.result;
    } catch (error) {
      console.error("[HeliusDAS] getAsset failed:", error);
      return null;
    }
  }

  /**
   * Get multiple assets by their IDs
   */
  async getAssetBatch(assetIds: string[]): Promise<DasAsset[]> {
    console.log("[HeliusDAS] Getting batch of", assetIds.length, "assets");

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-asset-batch",
          method: "getAssetBatch",
          params: { ids: assetIds },
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("[HeliusDAS] getAssetBatch error:", data.error);
        return [];
      }

      return data.result || [];
    } catch (error) {
      console.error("[HeliusDAS] getAssetBatch failed:", error);
      return [];
    }
  }

  /**
   * Get all assets owned by a wallet
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
    }
  ): Promise<SearchAssetsResult> {
    console.log("[HeliusDAS] Getting assets for owner:", ownerAddress);

    try {
      const params: any = {
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

      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-assets-by-owner",
          method: "getAssetsByOwner",
          params,
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("[HeliusDAS] getAssetsByOwner error:", data.error);
        return { total: 0, limit: 100, page: 1, items: [] };
      }

      return data.result || { total: 0, limit: 100, page: 1, items: [] };
    } catch (error) {
      console.error("[HeliusDAS] getAssetsByOwner failed:", error);
      return { total: 0, limit: 100, page: 1, items: [] };
    }
  }

  /**
   * Search assets with advanced filters
   */
  async searchAssets(params: SearchAssetsParams): Promise<SearchAssetsResult> {
    console.log("[HeliusDAS] Searching assets with params:", params);

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "search-assets",
          method: "searchAssets",
          params,
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("[HeliusDAS] searchAssets error:", data.error);
        return { total: 0, limit: 100, page: 1, items: [] };
      }

      return data.result || { total: 0, limit: 100, page: 1, items: [] };
    } catch (error) {
      console.error("[HeliusDAS] searchAssets failed:", error);
      return { total: 0, limit: 100, page: 1, items: [] };
    }
  }

  // ==========================================================================
  // Compressed NFT Support
  // ==========================================================================

  /**
   * Get merkle proof for a compressed asset
   */
  async getAssetProof(assetId: string): Promise<AssetProof | null> {
    console.log("[HeliusDAS] Getting proof for compressed asset:", assetId);

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-asset-proof",
          method: "getAssetProof",
          params: { id: assetId },
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("[HeliusDAS] getAssetProof error:", data.error);
        return null;
      }

      return data.result;
    } catch (error) {
      console.error("[HeliusDAS] getAssetProof failed:", error);
      return null;
    }
  }

  /**
   * Get proofs for multiple compressed assets
   */
  async getAssetProofBatch(assetIds: string[]): Promise<Map<string, AssetProof>> {
    console.log("[HeliusDAS] Getting proofs for", assetIds.length, "assets");

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-asset-proof-batch",
          method: "getAssetProofBatch",
          params: { ids: assetIds },
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("[HeliusDAS] getAssetProofBatch error:", data.error);
        return new Map();
      }

      const result = new Map<string, AssetProof>();
      if (data.result) {
        for (const [id, proof] of Object.entries(data.result)) {
          result.set(id, proof as AssetProof);
        }
      }

      return result;
    } catch (error) {
      console.error("[HeliusDAS] getAssetProofBatch failed:", error);
      return new Map();
    }
  }

  // ==========================================================================
  // Token Queries
  // ==========================================================================

  /**
   * Get all token balances for a wallet with prices
   */
  async getTokenBalances(ownerAddress: string): Promise<TokenBalance[]> {
    console.log("[HeliusDAS] Getting token balances for:", ownerAddress);

    try {
      // Get fungible tokens with prices
      const result = await this.searchAssets({
        ownerAddress,
        tokenType: "fungible",
        limit: 100,
      });

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
   */
  async getNftCollections(ownerAddress: string): Promise<Map<string, DasAsset[]>> {
    console.log("[HeliusDAS] Getting NFT collections for:", ownerAddress);

    try {
      const result = await this.searchAssets({
        ownerAddress,
        tokenType: "nonFungible",
        limit: 500,
      });

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
