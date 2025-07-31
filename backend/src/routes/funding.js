// backend/src/routes/funding.js
const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const { validateWalletSignature } = require('../middleware/auth');
const { CardService } = require('../services/cardService');
const { WalletService } = require('../services/walletService');
const { ConversionService } = require('../services/conversionService');
const { PrivacyService } = require('../services/privacyService');

// Initialize services
const cardService = new CardService();
const walletService = new WalletService();
const conversionService = new ConversionService();
const privacyService = new PrivacyService();

/**
 * POST /api/funding/create-card
 * Creates a new disposable virtual card
 */
router.post('/create-card', validateWalletSignature, async (req, res) => {
  try {
    const { 
      amount, 
      currency, // USDT, USDC, BTC, ETH
      expiryMinutes = 60,
      spendingLimit,
      merchantRestrictions = []
    } = req.body;
    
    const walletAddress = req.user.walletAddress;
    
    // Generate unique card ID with privacy-first approach
    const cardId = privacyService.generateDisposableId();
    
    // Check wallet balance
    const balance = await walletService.getBalance(walletAddress, currency);
    if (balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Lock funds in smart contract
    const lockTx = await walletService.lockFunds({
      walletAddress,
      amount,
      currency,
      cardId
    });
    
    // Convert to USD if needed (for card issuer)
    const usdAmount = await conversionService.convertToUSD(amount, currency);
    
    // Issue virtual card through provider
    const virtualCard = await cardService.issueCard({
      cardId,
      amount: usdAmount,
      expiryMinutes,
      spendingLimit: spendingLimit || usdAmount,
      merchantRestrictions
    });
    
    // Store card metadata (encrypted)
    await privacyService.storeCardMetadata({
      cardId,
      walletAddress,
      lockTx: lockTx.hash,
      expiresAt: new Date(Date.now() + expiryMinutes * 60000),
      autoDelete: true
    });
    
    // Return masked card details
    res.json({
      success: true,
      card: {
        id: cardId,
        last4: virtualCard.number.slice(-4),
        expiresAt: virtualCard.expiresAt,
        amount: usdAmount,
        currency: 'USD'
      }
    });
    
  } catch (error) {
    console.error('Card creation error:', error);
    res.status(500).json({ error: 'Failed to create card' });
  }
});

/**
 * POST /api/funding/fund-card
 * Add additional funds to existing card
 */
router.post('/fund-card/:cardId', validateWalletSignature, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { amount, currency } = req.body;
    const walletAddress = req.user.walletAddress;
    
    // Verify card ownership
    const cardOwner = await privacyService.getCardOwner(cardId);
    if (cardOwner !== walletAddress) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check if card is still active
    const cardStatus = await cardService.getCardStatus(cardId);
    if (cardStatus === 'expired' || cardStatus === 'deleted') {
      return res.status(400).json({ error: 'Card is no longer active' });
    }
    
    // Process additional funding
    const balance = await walletService.getBalance(walletAddress, currency);
    if (balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Lock additional funds
    const lockTx = await walletService.lockFunds({
      walletAddress,
      amount,
      currency,
      cardId
    });
    
    // Convert and add to card
    const usdAmount = await conversionService.convertToUSD(amount, currency);
    await cardService.addFunds(cardId, usdAmount);
    
    res.json({
      success: true,
      newBalance: await cardService.getBalance(cardId),
      transaction: lockTx.hash
    });
    
  } catch (error) {
    console.error('Funding error:', error);
    res.status(500).json({ error: 'Failed to fund card' });
  }
});

/**
 * DELETE /api/funding/delete-card
 * Immediately delete card and return unused funds
 */
router.delete('/delete-card/:cardId', validateWalletSignature, async (req, res) => {
  try {
    const { cardId } = req.params;
    const walletAddress = req.user.walletAddress;
    
    // Verify ownership
    const cardOwner = await privacyService.getCardOwner(cardId);
    if (cardOwner !== walletAddress) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Get remaining balance
    const remainingBalance = await cardService.getBalance(cardId);
    
    // Delete card from issuer
    await cardService.deleteCard(cardId);
    
    // Release locked funds from smart contract
    if (remainingBalance > 0) {
      const releaseTx = await walletService.releaseFunds({
        cardId,
        walletAddress,
        amount: remainingBalance
      });
      
      // Scrub all card data
      await privacyService.purgeCardData(cardId);
      
      res.json({
        success: true,
        refunded: remainingBalance,
        transaction: releaseTx.hash
      });
    } else {
      await privacyService.purgeCardData(cardId);
      res.json({ success: true, refunded: 0 });
    }
    
  } catch (error) {
    console.error('Deletion error:', error);
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

/**
 * GET /api/funding/card-status
 * Get minimal card status (privacy-conscious)
 */
router.get('/card-status/:cardId', validateWalletSignature, async (req, res) => {
  try {
    const { cardId } = req.params;
    const walletAddress = req.user.walletAddress;
    
    // Verify ownership
    const cardOwner = await privacyService.getCardOwner(cardId);
    if (cardOwner !== walletAddress) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const status = await cardService.getCardStatus(cardId);
    const balance = await cardService.getBalance(cardId);
    
    res.json({
      id: cardId,
      status,
      balance,
      // No transaction history stored for privacy
    });
    
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Failed to get card status' });
  }
});

/**
 * POST /api/funding/webhook/transaction
 * Handle card transaction webhooks from issuer
 */
router.post('/webhook/transaction', async (req, res) => {
  try {
    const { cardId, amount, merchant, status } = req.body;
    
    // Verify webhook signature
    if (!cardService.verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    if (status === 'completed') {
      // Check if card should auto-delete after use
      const metadata = await privacyService.getCardMetadata(cardId);
      if (metadata.deleteAfterUse) {
        // Schedule deletion in 5 minutes (allow for refunds)
        setTimeout(async () => {
          await privacyService.scheduleCardDeletion(cardId, 5);
        }, 5 * 60000);
      }
    }
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;

// backend/src/services/conversionService.js
class ConversionService {
  constructor() {
    this.providers = {
      primary: process.env.OFFRAMP_PRIMARY, // e.g., MoonPay, Wyre
      fallback: process.env.OFFRAMP_FALLBACK
    };
  }
  
  async convertToUSD(amount, currency) {
    // Implementation for stablecoin → USD conversion
    // This would integrate with your chosen off-ramp provider
    
    if (currency === 'USDC' || currency === 'USDT') {
      // Stablecoins are roughly 1:1
      return amount * 0.998; // Account for small fees
    }
    
    // For BTC, ETH, get current rates
    const rate = await this.getCurrentRate(currency, 'USD');
    return amount * rate;
  }
  
  async getCurrentRate(from, to) {
    // Fetch from price oracle or exchange API
    // Implementation depends on chosen provider
  }
}

// backend/src/services/privacyService.js
class PrivacyService {
  generateDisposableId() {
    // Generate cryptographically secure random ID
    return `dc_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  }
  
  async storeCardMetadata(data) {
    // Store with encryption, minimal data retention
    // Auto-expiry based on card settings
  }
  
  async purgeCardData(cardId) {
    // Complete data destruction
    // Remove from all systems, logs, backups
  }
  
  async scheduleCardDeletion(cardId, minutes) {
    // Set up job for automatic deletion
  }
}

module.exports = { ConversionService, PrivacyService };