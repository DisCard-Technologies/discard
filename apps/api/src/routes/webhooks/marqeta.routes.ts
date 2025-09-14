import { Router } from 'express';
import { MarqetaWebhookHandler } from '../../webhooks/marqeta.webhook';
import { Server as SocketIOServer } from 'socket.io';

const createMarqetaWebhookRoutes = (io?: SocketIOServer) => {
  const router = Router();
  const webhookHandler = new MarqetaWebhookHandler(io);

  /**
   * Marqeta webhook endpoint
   * 
   * This endpoint receives real-time notifications from Marqeta for:
   * - Transaction authorizations
   * - Transaction clearings/settlements
   * - Card status changes
   * - Other card lifecycle events
   * 
   * The webhook URL to configure in Marqeta dashboard:
   * - Sandbox: https://your-api-domain.com/api/v1/webhooks/marqeta
   * - Production: https://your-api-domain.com/api/v1/webhooks/marqeta
   * 
   * Required headers:
   * - x-marqeta-signature: HMAC SHA256 signature for payload validation
   * 
   * @route POST /api/v1/webhooks/marqeta
   */
  router.post('/marqeta', async (req, res) => {
    await webhookHandler.handleWebhook(req, res);
  });

  /**
   * Health check endpoint for Marqeta webhook
   * 
   * Marqeta may ping this endpoint to verify webhook URL is active
   * 
   * @route GET /api/v1/webhooks/marqeta/health
   */
  router.get('/marqeta/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      webhook: 'marqeta',
      timestamp: new Date().toISOString()
    });
  });

  return router;
};

export default createMarqetaWebhookRoutes;