/**
 * MSW server setup for Node.js testing environment
 * Provides reliable, interceptor-based API mocking for external crypto APIs
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Setup MSW server with all handlers
export const server = setupServer(...handlers);

// Export individual handler groups for selective use
export { 
  alchemyHandlers,
  blockcypherHandlers,
  coingeckoHandlers,
  feeEstimationHandlers
} from './handlers';