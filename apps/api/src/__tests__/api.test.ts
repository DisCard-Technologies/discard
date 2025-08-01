import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Simple test to validate basic API setup
describe('API Basic Tests', () => {
  const app = express();
  
  // Apply basic middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  
  // Simple health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'API is running' });
  });

  it('should respond with health check', async () => {
    const response = await request(app)
      .get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('should handle JSON requests', async () => {
    app.post('/test', (req, res) => {
      res.json({ received: req.body });
    });

    const response = await request(app)
      .post('/test')
      .send({ test: 'data' });

    expect(response.status).toBe(200);
    expect(response.body.received.test).toBe('data');
  });
});