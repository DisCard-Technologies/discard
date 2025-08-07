/**
 * MSW Jest setup for automatic server lifecycle management
 * Ensures MSW server is properly started/stopped for all tests
 */

import { server } from '../mocks/server';

// Start MSW server before all tests
beforeAll(() => {
  server.listen({
    // Allow TestContainers Docker API requests to bypass MSW
    onUnhandledRequest: (req) => {
      // Allow TestContainers Docker API requests to bypass MSW
      if (req.url.hostname === 'localhost' && 
          (req.url.pathname.includes('/info') || 
           req.url.pathname.includes('/containers') ||
           req.url.pathname.includes('/version') ||
           req.url.pathname.startsWith('/v'))) {
        return;
      }
      
      console.error(
        `[MSW] Error: intercepted a request without a matching request handler:
        
          • ${req.method} ${req.url}
        
        If you still wish to intercept this unhandled request, please create a request handler for it.
        Read more: https://mswjs.io/docs/http/intercepting-requests`
      );
    }
  });
});

// Reset handlers after each test to ensure test isolation
afterEach(() => {
  server.resetHandlers();
});

// Close MSW server after all tests
afterAll(() => {
  server.close();
});