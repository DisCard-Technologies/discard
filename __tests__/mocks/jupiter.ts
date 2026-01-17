/**
 * Jupiter API Mock
 *
 * Mocks Jupiter aggregator API for testing token swaps.
 */

// ============================================================================
// Mock Quote Response
// ============================================================================

export interface MockQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  platformFee: null | {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

export interface MockSwapResponse {
  swapTransaction: string; // Base64 encoded transaction
  lastValidBlockHeight: number;
}

// ============================================================================
// Default Mock Data
// ============================================================================

const defaultQuoteResponse: MockQuoteResponse = {
  inputMint: 'So11111111111111111111111111111111111111112', // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  inAmount: '1000000000', // 1 SOL
  outAmount: '150000000', // 150 USDC
  otherAmountThreshold: '148500000', // With 1% slippage
  swapMode: 'ExactIn',
  slippageBps: 100,
  platformFee: null,
  priceImpactPct: '0.01',
  routePlan: [
    {
      swapInfo: {
        ammKey: 'mock_amm_key',
        label: 'Raydium',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000000000',
        outAmount: '150000000',
        feeAmount: '300000',
        feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      percent: 100,
    },
  ],
  contextSlot: 123456789,
  timeTaken: 0.5,
};

const defaultSwapResponse: MockSwapResponse = {
  swapTransaction: 'mock_base64_transaction_data',
  lastValidBlockHeight: 123456789,
};

// ============================================================================
// Mock State
// ============================================================================

let currentQuoteResponse: MockQuoteResponse = { ...defaultQuoteResponse };
let currentSwapResponse: MockSwapResponse = { ...defaultSwapResponse };
let shouldFailQuote = false;
let shouldFailSwap = false;
let quoteError: string | null = null;
let swapError: string | null = null;

// ============================================================================
// Mock Functions
// ============================================================================

export const mockJupiterApi = {
  getQuote: jest.fn(async (params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
    swapMode?: 'ExactIn' | 'ExactOut';
  }): Promise<MockQuoteResponse> => {
    if (shouldFailQuote) {
      throw new Error(quoteError || 'Failed to get quote');
    }

    return {
      ...currentQuoteResponse,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inAmount: params.amount,
      slippageBps: params.slippageBps || 100,
      swapMode: params.swapMode || 'ExactIn',
    };
  }),

  getSwapTransaction: jest.fn(async (params: {
    quoteResponse: MockQuoteResponse;
    userPublicKey: string;
    wrapUnwrapSOL?: boolean;
  }): Promise<MockSwapResponse> => {
    if (shouldFailSwap) {
      throw new Error(swapError || 'Failed to get swap transaction');
    }

    return { ...currentSwapResponse };
  }),

  getTokenList: jest.fn(async () => [
    {
      address: 'So11111111111111111111111111111111111111112',
      symbol: 'SOL',
      name: 'Wrapped SOL',
      decimals: 9,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    },
    {
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    },
    {
      address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      symbol: 'USDT',
      name: 'USDT',
      decimals: 6,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
    },
  ]),

  getPrice: jest.fn(async (params: {
    inputMint: string;
    outputMint: string;
    amount: string;
  }): Promise<{ price: number; priceImpactPct: number }> => {
    // Mock price: 1 SOL = 150 USDC
    const solUsdcRate = 150;

    if (params.inputMint.includes('1111111111111111111111111111111112')) {
      return {
        price: solUsdcRate,
        priceImpactPct: 0.01,
      };
    }

    return {
      price: 1 / solUsdcRate,
      priceImpactPct: 0.01,
    };
  }),
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Set custom quote response for testing
 */
export const setMockQuoteResponse = (response: Partial<MockQuoteResponse>) => {
  currentQuoteResponse = { ...defaultQuoteResponse, ...response };
};

/**
 * Set custom swap response for testing
 */
export const setMockSwapResponse = (response: Partial<MockSwapResponse>) => {
  currentSwapResponse = { ...defaultSwapResponse, ...response };
};

/**
 * Simulate quote failure
 */
export const simulateQuoteFailure = (error?: string) => {
  shouldFailQuote = true;
  quoteError = error || null;
};

/**
 * Simulate swap failure
 */
export const simulateSwapFailure = (error?: string) => {
  shouldFailSwap = true;
  swapError = error || null;
};

/**
 * Reset Jupiter mocks to defaults
 */
export const resetJupiterMocks = () => {
  currentQuoteResponse = { ...defaultQuoteResponse };
  currentSwapResponse = { ...defaultSwapResponse };
  shouldFailQuote = false;
  shouldFailSwap = false;
  quoteError = null;
  swapError = null;

  mockJupiterApi.getQuote.mockClear();
  mockJupiterApi.getSwapTransaction.mockClear();
  mockJupiterApi.getTokenList.mockClear();
  mockJupiterApi.getPrice.mockClear();
};

/**
 * Set mock output amount (useful for testing specific swap scenarios)
 */
export const setMockOutputAmount = (amount: string) => {
  currentQuoteResponse.outAmount = amount;
};

// ============================================================================
// Token Constants (for convenience)
// ============================================================================

export const MOCK_TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
};

// Note: The actual Jupiter SDK mock would be applied in tests that import Jupiter
// This file provides the mock implementations and helpers
export default mockJupiterApi;
