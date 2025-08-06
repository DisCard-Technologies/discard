import { Request, Response } from 'express';
import { blockchainService } from './blockchain.service';
import { ratesService } from './rates.service';
import { walletConnectService } from './walletconnect.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { InputSanitizer } from '../../utils/input-sanitizer';
import { 
  WalletConnectRequest, 
  WalletBalanceResponse,
  MetaMaskConnectionRequest,
  WalletConnectSessionRequest,
  BitcoinWalletConnectionRequest,
  HardwareWalletConnectionRequest,
  CryptoWalletError,
  CRYPTO_ERROR_CODES 
} from '@discard/shared/src/types/crypto';
import { supabase } from '../../app';
import { v4 as uuidv4 } from 'uuid';

export class CryptoController {
  /**
   * Connect a new cryptocurrency wallet
   * POST /api/v1/crypto/wallets/connect
   */
  async connectWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { 
        walletType, 
        walletAddress, 
        walletName, 
        permissions,
        sessionDuration = 3600 
      }: WalletConnectRequest = req.body;

      // Validate required fields
      if (!walletType || !walletAddress || !permissions) {
        res.status(400).json({ 
          success: false,
          error: 'Wallet type, address, and permissions are required' 
        });
        return;
      }

      // Sanitize inputs
      const sanitizedWalletAddress = InputSanitizer.sanitizeString(walletAddress);
      const sanitizedWalletName = walletName ? InputSanitizer.sanitizeString(walletName) : undefined;

      // Validate wallet address format based on type
      const addressValidation = await blockchainService.validateWalletAddress(walletType, sanitizedWalletAddress);
      if (!addressValidation.isValid) {
        res.status(400).json({ 
          success: false,
          error: 'Invalid wallet address format',
          details: addressValidation.error
        });
        return;
      }

      // Check if wallet is already connected
      const { data: existingWallet, error: checkError } = await supabase
        .from('crypto_wallets')
        .select('wallet_id, connection_status')
        .eq('user_id', req.user.id)
        .eq('wallet_address_hash', blockchainService.hashWalletAddress(sanitizedWalletAddress))
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Database error checking existing wallet:', checkError);
        res.status(500).json({ 
          success: false,
          error: 'Failed to check wallet status' 
        });
        return;
      }

      if (existingWallet && existingWallet.connection_status === 'connected') {
        res.status(409).json({ 
          success: false,
          error: 'Wallet is already connected',
          walletId: existingWallet.wallet_id
        });
        return;
      }

      // Encrypt wallet address
      const encryptedAddress = await blockchainService.encryptWalletAddress(sanitizedWalletAddress);
      
      // Determine supported currencies based on wallet type
      const supportedCurrencies = blockchainService.getSupportedCurrencies(walletType);

      const walletId = uuidv4();
      const sessionExpiry = new Date(Date.now() + sessionDuration * 1000);

      // Create wallet record
      const { data: wallet, error: insertError } = await supabase
        .from('crypto_wallets')
        .insert({
          wallet_id: walletId,
          user_id: req.user.id,
          wallet_type: walletType,
          wallet_address_encrypted: encryptedAddress,
          wallet_address_hash: blockchainService.hashWalletAddress(sanitizedWalletAddress),
          wallet_name: sanitizedWalletName,
          connection_status: 'connected',
          permissions: permissions,
          session_expiry: sessionExpiry.toISOString(),
          supported_currencies: supportedCurrencies,
          last_balance_check: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('Database error creating wallet:', insertError);
        res.status(500).json({ 
          success: false,
          error: 'Failed to connect wallet' 
        });
        return;
      }

      // Create wallet session record
      const sessionId = uuidv4();
      const { error: sessionError } = await supabase
        .from('wallet_sessions')
        .insert({
          session_id: sessionId,
          wallet_id: walletId,
          user_id: req.user.id,
          is_active: true,
          expires_at: sessionExpiry.toISOString(),
          permissions: permissions,
          last_activity: new Date().toISOString(),
          created_at: new Date().toISOString()
        });

      if (sessionError) {
        console.error('Database error creating wallet session:', sessionError);
        // Continue since wallet was created successfully
      }

      res.status(201).json({
        success: true,
        data: {
          walletId: wallet.wallet_id,
          walletType: wallet.wallet_type,
          walletName: wallet.wallet_name,
          connectionStatus: wallet.connection_status,
          permissions: wallet.permissions,
          supportedCurrencies: wallet.supported_currencies,
          sessionExpiry: wallet.session_expiry,
          sessionId: sessionId
        }
      });

    } catch (error) {
      console.error('Connect wallet error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  /**
   * Get list of connected wallets
   * GET /api/v1/crypto/wallets
   */
  async getWallets(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { data: wallets, error } = await supabase
        .from('crypto_wallets')
        .select(`
          wallet_id,
          wallet_type,
          wallet_name,
          connection_status,
          permissions,
          supported_currencies,
          session_expiry,
          last_balance_check,
          created_at,
          updated_at
        `)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Database error fetching wallets:', error);
        res.status(500).json({ 
          success: false,
          error: 'Failed to fetch wallets' 
        });
        return;
      }

      // Check for expired sessions and update status
      const currentTime = new Date();
      const walletsWithStatus = wallets.map(wallet => {
        if (wallet.connection_status === 'connected' && new Date(wallet.session_expiry) < currentTime) {
          // Mark as expired (we should also update the database)
          this.updateWalletStatus(wallet.wallet_id, 'expired');
          return { ...wallet, connection_status: 'expired' };
        }
        return wallet;
      });

      res.status(200).json({
        success: true,
        data: {
          wallets: walletsWithStatus,
          total: wallets.length
        }
      });

    } catch (error) {
      console.error('Get wallets error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  /**
   * Disconnect a wallet
   * DELETE /api/v1/crypto/wallets/:walletId
   */
  async disconnectWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { walletId } = req.params;

      if (!walletId) {
        res.status(400).json({ 
          success: false,
          error: 'Wallet ID is required' 
        });
        return;
      }

      // Verify wallet ownership
      const { data: wallet, error: fetchError } = await supabase
        .from('crypto_wallets')
        .select('wallet_id, connection_status')
        .eq('wallet_id', walletId)
        .eq('user_id', req.user.id)
        .single();

      if (fetchError) {
        console.error('Database error fetching wallet:', fetchError);
        res.status(404).json({ 
          success: false,
          error: 'Wallet not found' 
        });
        return;
      }

      // Update wallet status to disconnected
      const { error: updateError } = await supabase
        .from('crypto_wallets')
        .update({
          connection_status: 'disconnected',
          updated_at: new Date().toISOString()
        })
        .eq('wallet_id', walletId)
        .eq('user_id', req.user.id);

      if (updateError) {
        console.error('Database error disconnecting wallet:', updateError);
        res.status(500).json({ 
          success: false,
          error: 'Failed to disconnect wallet' 
        });
        return;
      }

      // Deactivate all sessions for this wallet
      const { error: sessionError } = await supabase
        .from('wallet_sessions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('wallet_id', walletId)
        .eq('user_id', req.user.id);

      if (sessionError) {
        console.error('Database error deactivating sessions:', sessionError);
        // Continue since wallet was disconnected successfully
      }

      res.status(200).json({
        success: true,
        message: 'Wallet disconnected successfully'
      });

    } catch (error) {
      console.error('Disconnect wallet error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  /**
   * Get real-time wallet balance
   * GET /api/v1/crypto/wallets/:walletId/balance
   */
  async getWalletBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { walletId } = req.params;

      if (!walletId) {
        res.status(400).json({ 
          success: false,
          error: 'Wallet ID is required' 
        });
        return;
      }

      // Verify wallet ownership and get wallet details
      const { data: wallet, error: fetchError } = await supabase
        .from('crypto_wallets')
        .select('*')
        .eq('wallet_id', walletId)
        .eq('user_id', req.user.id)
        .single();

      if (fetchError) {
        console.error('Database error fetching wallet:', fetchError);
        res.status(404).json({ 
          success: false,
          error: 'Wallet not found' 
        });
        return;
      }

      if (wallet.connection_status !== 'connected') {
        res.status(400).json({ 
          success: false,
          error: 'Wallet is not connected' 
        });
        return;
      }

      // Check if session is still valid
      if (new Date(wallet.session_expiry) < new Date()) {
        await this.updateWalletStatus(walletId, 'expired');
        res.status(400).json({ 
          success: false,
          error: 'Wallet session has expired' 
        });
        return;
      }

      // Decrypt wallet address
      const walletAddress = await blockchainService.decryptWalletAddress(wallet.wallet_address_encrypted);

      // Fetch balances from blockchain
      const balanceData = await blockchainService.getWalletBalances(
        wallet.wallet_type,
        walletAddress,
        wallet.supported_currencies
      );

      if (!balanceData.success) {
        res.status(500).json({ 
          success: false,
          error: 'Failed to fetch wallet balance',
          details: balanceData.error
        });
        return;
      }

      // Get current conversion rates
      const rates = await ratesService.getCurrentRates(wallet.supported_currencies);

      // Calculate USD values
      const balancesWithUsd = balanceData.balances.map(balance => ({
        currency: balance.currency,
        balance: balance.balance,
        usdValue: rates[balance.currency] 
          ? Math.round(parseFloat(balance.balance) * parseFloat(rates[balance.currency].usd) * 100) // Convert to cents
          : 0,
        conversionRate: rates[balance.currency]?.usd || '0'
      }));

      const totalUsdValue = balancesWithUsd.reduce((sum, balance) => sum + balance.usdValue, 0);

      // Update last balance check
      await supabase
        .from('crypto_wallets')
        .update({
          last_balance_check: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('wallet_id', walletId);

      const response: WalletBalanceResponse = {
        walletId: walletId,
        balances: balancesWithUsd,
        lastUpdated: new Date().toISOString(),
        totalUsdValue: totalUsdValue
      };

      res.status(200).json({
        success: true,
        data: response
      });

    } catch (error) {
      console.error('Get wallet balance error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }

  /**
   * Create WalletConnect session proposal
   * POST /api/v1/crypto/wallets/walletconnect/propose
   */
  async createWalletConnectProposal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { 
        bridgeUrl, 
        sessionDuration = 3600, 
        requiredNamespaces = ['eip155'] 
      }: WalletConnectSessionRequest = req.body;

      // Check if WalletConnect is properly configured
      if (!walletConnectService.isConfigured()) {
        res.status(503).json({ 
          success: false,
          error: 'WalletConnect service not configured' 
        });
        return;
      }

      // Initialize WalletConnect service if needed
      await walletConnectService.initialize();

      // Create session proposal
      const { uri, proposalId } = await walletConnectService.createSessionProposal(
        req.user.id,
        { bridgeUrl, sessionDuration, requiredNamespaces }
      );

      res.status(200).json({
        success: true,
        data: {
          uri,
          proposalId,
          qrCode: uri, // The URI can be used to generate QR code on frontend
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
        }
      });

    } catch (error) {
      console.error('Create WalletConnect proposal error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to create WalletConnect session proposal',
        details: error.message
      });
    }
  }

  /**
   * Approve WalletConnect session proposal
   * POST /api/v1/crypto/wallets/walletconnect/approve
   */
  async approveWalletConnectProposal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { proposalId, accounts, walletName } = req.body;

      if (!proposalId || !accounts || !Array.isArray(accounts) || accounts.length === 0) {
        res.status(400).json({ 
          success: false,
          error: 'Proposal ID and accounts are required' 
        });
        return;
      }

      // Validate account addresses
      for (const account of accounts) {
        const validation = await blockchainService.validateWalletAddress('walletconnect', account);
        if (!validation.isValid) {
          res.status(400).json({ 
            success: false,
            error: `Invalid account address: ${account}`,
            details: validation.error
          });
          return;
        }
      }

      // Approve the session
      const session = await walletConnectService.approveSessionProposal(
        proposalId,
        req.user.id,
        accounts
      );

      // Create wallet record in crypto_wallets table
      const walletId = uuidv4();
      const encryptedAddress = await blockchainService.encryptWalletAddress(session.walletAddress);
      const supportedCurrencies = blockchainService.getSupportedCurrencies('walletconnect');

      const { data: wallet, error: insertError } = await supabase
        .from('crypto_wallets')
        .insert({
          wallet_id: walletId,
          user_id: req.user.id,
          wallet_type: 'walletconnect',
          wallet_address_encrypted: encryptedAddress,
          wallet_address_hash: blockchainService.hashWalletAddress(session.walletAddress),
          wallet_name: walletName || session.walletName || 'WalletConnect Wallet',
          connection_status: 'connected',
          permissions: session.permissions,
          session_expiry: new Date(session.expiryTimestamp * 1000).toISOString(),
          supported_currencies: supportedCurrencies,
          last_balance_check: new Date().toISOString(),
          topic: session.topic, // Store WalletConnect topic
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('Database error creating WalletConnect wallet:', insertError);
        res.status(500).json({ 
          success: false,
          error: 'Failed to save wallet connection' 
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: {
          walletId: wallet.wallet_id,
          sessionId: session.sessionId,
          walletType: 'walletconnect',
          walletName: wallet.wallet_name,
          walletAddress: session.walletAddress, // Return plaintext for confirmation
          connectionStatus: 'connected',
          permissions: session.permissions,
          supportedCurrencies: supportedCurrencies,
          sessionExpiry: wallet.session_expiry,
          topic: session.topic
        }
      });

    } catch (error) {
      console.error('Approve WalletConnect proposal error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to approve WalletConnect session',
        details: error.message
      });
    }
  }

  /**
   * Reject WalletConnect session proposal
   * POST /api/v1/crypto/wallets/walletconnect/reject
   */
  async rejectWalletConnectProposal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { proposalId, reason } = req.body;

      if (!proposalId) {
        res.status(400).json({ 
          success: false,
          error: 'Proposal ID is required' 
        });
        return;
      }

      await walletConnectService.rejectSessionProposal(proposalId, reason);

      res.status(200).json({
        success: true,
        message: 'WalletConnect session proposal rejected'
      });

    } catch (error) {
      console.error('Reject WalletConnect proposal error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to reject WalletConnect session proposal',
        details: error.message
      });
    }
  }

  /**
   * Disconnect WalletConnect session
   * POST /api/v1/crypto/wallets/walletconnect/disconnect
   */
  async disconnectWalletConnectSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { walletId, topic } = req.body;

      if (!walletId && !topic) {
        res.status(400).json({ 
          success: false,
          error: 'Wallet ID or topic is required' 
        });
        return;
      }

      let walletTopic = topic;

      // If walletId provided, get topic from database
      if (walletId && !topic) {
        const { data: wallet, error: fetchError } = await supabase
          .from('crypto_wallets')
          .select('topic')
          .eq('wallet_id', walletId)
          .eq('user_id', req.user.id)
          .single();

        if (fetchError || !wallet?.topic) {
          res.status(404).json({ 
            success: false,
            error: 'Wallet not found or invalid' 
          });
          return;
        }

        walletTopic = wallet.topic;
      }

      // Disconnect WalletConnect session
      await walletConnectService.disconnectSession(walletTopic);

      // Update wallet status in database
      const { error: updateError } = await supabase
        .from('crypto_wallets')
        .update({
          connection_status: 'disconnected',
          updated_at: new Date().toISOString()
        })
        .eq('topic', walletTopic)
        .eq('user_id', req.user.id);

      if (updateError) {
        console.error('Database error updating wallet status:', updateError);
        // Continue since WalletConnect session was disconnected successfully
      }

      res.status(200).json({
        success: true,
        message: 'WalletConnect session disconnected successfully'
      });

    } catch (error) {
      console.error('Disconnect WalletConnect session error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to disconnect WalletConnect session',
        details: error.message
      });
    }
  }

  /**
   * Get active WalletConnect sessions
   * GET /api/v1/crypto/wallets/walletconnect/sessions
   */
  async getWalletConnectSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      // Get sessions from WalletConnect service
      const sessions = await walletConnectService.getActiveSessions(req.user.id);

      // Get corresponding wallet records from database
      const { data: wallets, error } = await supabase
        .from('crypto_wallets')
        .select('*')
        .eq('user_id', req.user.id)
        .eq('wallet_type', 'walletconnect')
        .eq('connection_status', 'connected');

      if (error) {
        console.error('Database error fetching WalletConnect wallets:', error);
        res.status(500).json({ 
          success: false,
          error: 'Failed to fetch WalletConnect sessions' 
        });
        return;
      }

      // Combine session and wallet data
      const combinedData = sessions.map(session => {
        const wallet = wallets.find(w => w.topic === session.topic);
        return {
          sessionId: session.sessionId,
          walletId: wallet?.wallet_id,
          topic: session.topic,
          walletAddress: session.walletAddress,
          walletName: session.walletName || wallet?.wallet_name,
          expiresAt: new Date(session.expiryTimestamp * 1000).toISOString(),
          permissions: session.permissions,
          supportedCurrencies: wallet?.supported_currencies || [],
          chainIds: session.chainIds,
          methods: session.methods,
          lastActivity: wallet?.updated_at
        };
      });

      res.status(200).json({
        success: true,
        data: {
          sessions: combinedData,
          total: combinedData.length
        }
      });

    } catch (error) {
      console.error('Get WalletConnect sessions error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get WalletConnect sessions',
        details: error.message
      });
    }
  }

  /**
   * Cleanup expired WalletConnect sessions
   * POST /api/v1/crypto/wallets/walletconnect/cleanup
   */
  async cleanupWalletConnectSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      await walletConnectService.cleanupExpiredSessions();

      res.status(200).json({
        success: true,
        message: 'WalletConnect sessions cleanup completed'
      });

    } catch (error) {
      console.error('Cleanup WalletConnect sessions error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to cleanup WalletConnect sessions',
        details: error.message
      });
    }
  }

  /**
   * Helper method to update wallet status
   */
  private async updateWalletStatus(walletId: string, status: 'connected' | 'disconnected' | 'expired'): Promise<void> {
    try {
      await supabase
        .from('crypto_wallets')
        .update({
          connection_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('wallet_id', walletId);
    } catch (error) {
      console.error('Error updating wallet status:', error);
    }
  }
}

export const cryptoController = new CryptoController();