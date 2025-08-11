import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables FIRST before any other imports that might use them
dotenv.config();

import { createClient } from '@supabase/supabase-js';
// import userRoutes from './routes/users';
// import authRoutes from './services/auth/auth.routes';
// import cardRoutes from './services/cards/cards.routes';
// import fundingRoutes from './services/funding/funding.routes';
// import cryptoRoutes from './services/crypto/crypto.routes';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ CRITICAL: Missing required Supabase environment variables');
  console.error('   Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in your .env file');
  console.error('   See apps/api/env.example for required variables');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.get('/api/v1', (req, res) => {
  res.json({ 
    message: 'DisCard API v1',
    version: '1.0.0'
  });
});

// Authentication routes
// app.use('/api/v1/auth', authRoutes);

// User routes (start with simple routes first)
// app.use('/api/v1/users', userRoutes);

// Card management routes
// app.use('/api/v1/cards', cardRoutes);

// Funding management routes
// app.use('/api/v1/funding', fundingRoutes);

// Cryptocurrency wallet routes
// app.use('/api/v1/crypto', cryptoRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 DisCard API server running on port ${PORT}`);
    console.log(`📊 Health check available at http://localhost:${PORT}/health`);
  });
}

module.exports = app;
export default app; 