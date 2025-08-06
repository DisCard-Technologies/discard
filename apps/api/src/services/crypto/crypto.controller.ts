import { Request, Response } from 'express';
import { blockchainService } from './blockchain.service';
import { ratesService } from './rates.service';
import { walletConnectService } from './walletconnect.service';
import { metamaskService } from './metamask.service';
import { bitcoinService } from './bitcoin.service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { InputSanitizer } from '../../utils/input-sanitizer';
import { 
  WalletConnectRequest, 
  WalletBalanceResponse,
  MetaMaskConnectionRequest,
  WalletConnectSessionRequest,
  BitcoinWalletRequest,
  BitcoinTransactionRequest,
  BitcoinBroadcastRequest,
  CryptoWalletError,
  CRYPTO_ERROR_CODES,
  ConversionRates
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

    } catch (error: any) {
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

    } catch (error: any) {
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

    } catch (error: any) {
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

    } catch (error: any) {
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

    } catch (error: any) {
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

    } catch (error: any) {
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

    } catch (error: any) {
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

    } catch (error: any) {
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

    } catch (error: any) {
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

    } catch (error: any) {
      console.error('Cleanup WalletConnect sessions error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to cleanup WalletConnect sessions',
        details: error.message
      });
    }
  }

  /**
   * Check MetaMask availability
   * GET /api/v1/crypto/wallets/metamask/availability
   */
  async checkMetaMaskAvailability(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      // Check if MetaMask service is configured
      if (!metamaskService.isConfigured()) {
        res.status(503).json({ 
          success: false,
          error: 'MetaMask service not configured' 
        });
        return;
      }

      // Initialize MetaMask service if needed
      await metamaskService.initialize();

      // Check MetaMask availability
      const isAvailable = await metamaskService.isMetaMaskAvailable();

      res.status(200).json({
        success: true,
        data: {
          isAvailable,
          isConfigured: metamaskService.isConfigured(),
          message: isAvailable ? 'MetaMask is available' : 'MetaMask not detected or not unlocked'
        }
      });

    } catch (error: any) {
      console.error('Check MetaMask availability error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to check MetaMask availability',
        details: error.message
      });
    }
  }

  /**
   * Request MetaMask connection
   * POST /api/v1/crypto/wallets/metamask/connect
   */
  async connectMetaMask(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { 
        requestedPermissions = ['eth_accounts'], 
        sessionDuration = 3600 
      }: MetaMaskConnectionRequest = req.body;

      // Check if MetaMask service is configured
      if (!metamaskService.isConfigured()) {
        res.status(503).json({ 
          success: false,
          error: 'MetaMask service not configured' 
        });
        return;
      }

      // Initialize MetaMask service if needed
      await metamaskService.initialize();

      // Request MetaMask connection
      const connection = await metamaskService.requestConnection(req.user.id, {
        requestedPermissions,
        sessionDuration
      });

      // Create wallet record in crypto_wallets table
      const walletId = uuidv4();
      const primaryAccount = connection.accounts[0];
      const encryptedAddress = await blockchainService.encryptWalletAddress(primaryAccount);
      const supportedCurrencies = blockchainService.getSupportedCurrencies('metamask');

      const { data: wallet, error: insertError } = await supabase
        .from('crypto_wallets')
        .insert({
          wallet_id: walletId,
          user_id: req.user.id,
          wallet_type: 'metamask',
          wallet_address_encrypted: encryptedAddress,
          wallet_address_hash: blockchainService.hashWalletAddress(primaryAccount),
          wallet_name: 'MetaMask Wallet',
          connection_status: 'connected',
          permissions: connection.permissions,
          session_expiry: connection.sessionExpiry.toISOString(),
          supported_currencies: supportedCurrencies,
          last_balance_check: new Date().toISOString(),
          // Store MetaMask connection ID for reference
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('Database error creating MetaMask wallet:', insertError);
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
          connectionId: connection.connectionId,
          walletType: 'metamask',
          walletName: wallet.wallet_name,
          accounts: connection.accounts,
          chainId: connection.chainId,
          connectionStatus: 'connected',
          permissions: connection.permissions,
          supportedCurrencies: supportedCurrencies,
          sessionExpiry: wallet.session_expiry
        }
      });

    } catch (error: any) {
      console.error('Connect MetaMask error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to connect MetaMask',
        details: error.message
      });
    }
  }

  /**
   * Disconnect MetaMask connection
   * POST /api/v1/crypto/wallets/metamask/disconnect
   */
  async disconnectMetaMask(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { connectionId, walletId } = req.body;

      if (!connectionId && !walletId) {
        res.status(400).json({ 
          success: false,
          error: 'Connection ID or wallet ID is required' 
        });
        return;
      }

      let targetConnectionId = connectionId;

      // If walletId provided, get connection ID from database
      if (walletId && !connectionId) {
        const { data: sessions, error: fetchError } = await supabase
          .from('wallet_sessions')
          .select('connection_metadata')
          .eq('wallet_id', walletId)
          .eq('user_id', req.user.id)
          .eq('is_active', true)
          .single();

        if (fetchError || !sessions?.connection_metadata?.metamask_connection_id) {
          res.status(404).json({ 
            success: false,
            error: 'MetaMask connection not found' 
          });
          return;
        }

        targetConnectionId = sessions.connection_metadata.metamask_connection_id;
      }

      // Disconnect MetaMask connection
      await metamaskService.disconnectConnection(targetConnectionId);

      // Update wallet status in database
      const { error: updateError } = await supabase
        .from('crypto_wallets')
        .update({
          connection_status: 'disconnected',
          updated_at: new Date().toISOString()
        })
        .eq('wallet_id', walletId || targetConnectionId)
        .eq('user_id', req.user.id);

      if (updateError) {
        console.error('Database error updating wallet status:', updateError);
        // Continue since MetaMask connection was disconnected successfully
      }

      res.status(200).json({
        success: true,
        message: 'MetaMask connection disconnected successfully'
      });

    } catch (error: any) {
      console.error('Disconnect MetaMask error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to disconnect MetaMask',
        details: error.message
      });
    }
  }

  /**
   * Get active MetaMask connections
   * GET /api/v1/crypto/wallets/metamask/connections
   */
  async getMetaMaskConnections(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      // Get connections from MetaMask service
      const connections = await metamaskService.getActiveConnections(req.user.id);

      // Get corresponding wallet records from database
      const { data: wallets, error } = await supabase
        .from('crypto_wallets')
        .select('*')
        .eq('user_id', req.user.id)
        .eq('wallet_type', 'metamask')
        .eq('connection_status', 'connected');

      if (error) {
        console.error('Database error fetching MetaMask wallets:', error);
        res.status(500).json({ 
          success: false,
          error: 'Failed to fetch MetaMask connections' 
        });
        return;
      }

      // Combine connection and wallet data
      const combinedData = connections.map(connection => {
        const wallet = wallets.find(w => 
          w.wallet_address_hash === blockchainService.hashWalletAddress(connection.accounts[0])
        );
        return {
          connectionId: connection.connectionId,
          walletId: wallet?.wallet_id,
          accounts: connection.accounts,
          chainId: connection.chainId,
          isConnected: connection.isConnected,
          permissions: connection.permissions,
          supportedCurrencies: wallet?.supported_currencies || [],
          sessionExpiry: connection.sessionExpiry.toISOString(),
          lastActivity: wallet?.updated_at
        };
      });

      res.status(200).json({
        success: true,
        data: {
          connections: combinedData,
          total: combinedData.length
        }
      });

    } catch (error: any) {
      console.error('Get MetaMask connections error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get MetaMask connections',
        details: error.message
      });
    }
  }

  /**
   * Send MetaMask transaction
   * POST /api/v1/crypto/wallets/metamask/transaction
   */
  async sendMetaMaskTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { connectionId, to, value, data, gas, gasPrice } = req.body;

      if (!connectionId || !to) {
        res.status(400).json({ 
          success: false,
          error: 'Connection ID and recipient address are required' 
        });
        return;
      }

      // Validate recipient address
      const addressValidation = await blockchainService.validateWalletAddress('metamask', to);
      if (!addressValidation.isValid) {
        res.status(400).json({ 
          success: false,
          error: 'Invalid recipient address',
          details: addressValidation.error
        });
        return;
      }

      // Send transaction through MetaMask
      const txHash = await metamaskService.sendTransaction(connectionId, {
        to,
        value,
        data,
        gas,
        gasPrice
      });

      res.status(200).json({
        success: true,
        data: {
          transactionHash: txHash,
          status: 'pending'
        }
      });

    } catch (error: any) {
      console.error('Send MetaMask transaction error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to send transaction',
        details: error.message
      });
    }
  }

  /**
   * Sign message with MetaMask
   * POST /api/v1/crypto/wallets/metamask/sign
   */
  async signMetaMaskMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { connectionId, message, address, method = 'personal_sign' } = req.body;

      if (!connectionId || !message || !address) {
        res.status(400).json({ 
          success: false,
          error: 'Connection ID, message, and address are required' 
        });
        return;
      }

      // Validate signing method
      if (!['personal_sign', 'eth_signTypedData_v4'].includes(method)) {
        res.status(400).json({ 
          success: false,
          error: 'Invalid signing method' 
        });
        return;
      }

      // Sign message through MetaMask
      const signature = await metamaskService.signMessage(connectionId, {
        message,
        address,
        method
      });

      res.status(200).json({
        success: true,
        data: {
          signature,
          message,
          address,
          method
        }
      });

    } catch (error: any) {
      console.error('Sign MetaMask message error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to sign message',
        details: error.message
      });
    }
  }

  /**
   * Switch MetaMask chain
   * POST /api/v1/crypto/wallets/metamask/switch-chain
   */
  async switchMetaMaskChain(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { connectionId, chainId } = req.body;

      if (!connectionId || !chainId) {
        res.status(400).json({ 
          success: false,
          error: 'Connection ID and chain ID are required' 
        });
        return;
      }

      // Switch chain through MetaMask
      await metamaskService.switchChain(connectionId, chainId);

      res.status(200).json({
        success: true,
        data: {
          chainId,
          message: 'Chain switched successfully'
        }
      });

    } catch (error: any) {
      console.error('Switch MetaMask chain error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to switch chain',
        details: error.message
      });
    }
  }

  /**
   * Cleanup expired MetaMask connections
   * POST /api/v1/crypto/wallets/metamask/cleanup
   */
  async cleanupMetaMaskConnections(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      await metamaskService.cleanupExpiredConnections();

      res.status(200).json({
        success: true,
        message: 'MetaMask connections cleanup completed'
      });

    } catch (error: any) {
      console.error('Cleanup MetaMask connections error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to cleanup MetaMask connections',
        details: error.message
      });
    }
  }

  /**
   * Connect Bitcoin wallet by importing address
   * POST /api/v1/crypto/wallets/bitcoin/connect
   */
  async connectBitcoinWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { address, walletName, network = 'mainnet' }: BitcoinWalletRequest = req.body;

      if (!address) {
        res.status(400).json({ 
          success: false,
          error: 'Bitcoin address is required' 
        });
        return;
      }

      // Sanitize inputs
      const sanitizedAddress = InputSanitizer.sanitizeString(address);
      const sanitizedWalletName = walletName ? InputSanitizer.sanitizeString(walletName) : undefined;
      const sanitizedNetwork = InputSanitizer.sanitizeString(network);

      // Connect Bitcoin wallet
      const connection = await bitcoinService.connectBitcoinWallet(req.user.id, {
        address: sanitizedAddress,
        walletName: sanitizedWalletName,
        network: sanitizedNetwork
      });

      res.status(201).json({
        success: true,
        data: connection
      });

    } catch (error: any) {
      console.error('Connect Bitcoin wallet error:', error);
      if (error.code) {
        // Handle crypto wallet errors
        res.status(400).json({ 
          success: false,
          error: error.message,
          code: error.code,
          details: error.details
        });
      } else {
        res.status(500).json({ 
          success: false,
          error: 'Failed to connect Bitcoin wallet',
          details: error.message
        });
      }
    }
  }

  /**
   * Get Bitcoin wallets for user
   * GET /api/v1/crypto/wallets/bitcoin/list
   */
  async getBitcoinWallets(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const wallets = await bitcoinService.getBitcoinWallets(req.user.id);

      res.status(200).json({
        success: true,
        data: {
          wallets,
          total: wallets.length
        }
      });

    } catch (error: any) {
      console.error('Get Bitcoin wallets error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get Bitcoin wallets',
        details: error.message
      });
    }
  }

  /**
   * Disconnect Bitcoin wallet
   * POST /api/v1/crypto/wallets/bitcoin/disconnect
   */
  async disconnectBitcoinWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { walletId } = req.body;

      if (!walletId) {
        res.status(400).json({ 
          success: false,
          error: 'Wallet ID is required' 
        });
        return;
      }

      await bitcoinService.disconnectBitcoinWallet(req.user.id, walletId);

      res.status(200).json({
        success: true,
        message: 'Bitcoin wallet disconnected successfully'
      });

    } catch (error: any) {
      console.error('Disconnect Bitcoin wallet error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to disconnect Bitcoin wallet',
        details: error.message
      });
    }
  }

  /**
   * Get Bitcoin wallet balance
   * GET /api/v1/crypto/wallets/bitcoin/balance/:walletId
   */
  async getBitcoinWalletBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { walletId } = req.params;
      const { refresh = 'false' } = req.query;

      if (!walletId) {
        res.status(400).json({ 
          success: false,
          error: 'Wallet ID is required' 
        });
        return;
      }

      // Get wallet from database
      const { data: wallet, error } = await supabase
        .from('crypto_wallets')
        .select('*')
        .eq('wallet_id', walletId)
        .eq('user_id', req.user.id)
        .eq('wallet_type', 'bitcoin')
        .single();

      if (error || !wallet) {
        res.status(404).json({ 
          success: false,
          error: 'Bitcoin wallet not found' 
        });
        return;
      }

      // Decrypt address
      const address = await (bitcoinService as any).decryptBitcoinAddress(wallet.wallet_address_encrypted);
      const network = wallet.wallet_metadata?.network || 'mainnet';

      // Get balance (fresh or cached)
      const balance = await bitcoinService.getBitcoinBalance(address, network);

      // Update last balance check if refresh requested
      if (refresh === 'true') {
        await supabase
          .from('crypto_wallets')
          .update({
            last_balance_check: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('wallet_id', walletId);
      }

      res.status(200).json({
        success: true,
        data: {
          walletId,
          address,
          network,
          balance,
          lastChecked: wallet.last_balance_check,
          refreshed: refresh === 'true'
        }
      });

    } catch (error: any) {
      console.error('Get Bitcoin wallet balance error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get Bitcoin wallet balance',
        details: error.message
      });
    }
  }

  /**
   * Generate Bitcoin address QR code
   * POST /api/v1/crypto/wallets/bitcoin/qr-code
   */
  async generateBitcoinQRCode(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { address, amount, label } = req.body;

      if (!address) {
        res.status(400).json({ 
          success: false,
          error: 'Bitcoin address is required' 
        });
        return;
      }

      // Sanitize inputs
      const sanitizedAddress = InputSanitizer.sanitizeString(address);
      const sanitizedLabel = label ? InputSanitizer.sanitizeString(label) : undefined;

      // Generate QR code
      const qrCode = await bitcoinService.generateAddressQRCode(
        sanitizedAddress,
        amount ? parseFloat(amount) : undefined,
        sanitizedLabel
      );

      res.status(200).json({
        success: true,
        data: {
          address: sanitizedAddress,
          amount,
          label: sanitizedLabel,
          qrCode
        }
      });

    } catch (error: any) {
      console.error('Generate Bitcoin QR code error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to generate Bitcoin QR code',
        details: error.message
      });
    }
  }

  /**
   * Create Bitcoin transaction (unsigned)
   * POST /api/v1/crypto/wallets/bitcoin/transaction/create
   */
  async createBitcoinTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { 
        fromAddress, 
        toAddress, 
        amount, 
        feeRate = 10, 
        network = 'mainnet' 
      }: BitcoinTransactionRequest = req.body;

      if (!fromAddress || !toAddress || !amount) {
        res.status(400).json({ 
          success: false,
          error: 'From address, to address, and amount are required' 
        });
        return;
      }

      if (amount <= 0) {
        res.status(400).json({ 
          success: false,
          error: 'Amount must be greater than 0' 
        });
        return;
      }

      // Verify user owns the from address
      const { data: wallet, error } = await supabase
        .from('crypto_wallets')
        .select('*')
        .eq('user_id', req.user.id)
        .eq('wallet_type', 'bitcoin')
        .eq('wallet_address_hash', (bitcoinService as any).hashBitcoinAddress(fromAddress))
        .single();

      if (error || !wallet) {
        res.status(404).json({ 
          success: false,
          error: 'Bitcoin wallet not found or not owned by user' 
        });
        return;
      }

      // Create unsigned transaction
      const transaction = await bitcoinService.createBitcoinTransaction(
        fromAddress,
        toAddress,
        amount,
        feeRate,
        network
      );

      res.status(200).json({
        success: true,
        data: transaction
      });

    } catch (error: any) {
      console.error('Create Bitcoin transaction error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to create Bitcoin transaction',
        details: error.message
      });
    }
  }

  /**
   * Broadcast Bitcoin transaction
   * POST /api/v1/crypto/wallets/bitcoin/transaction/broadcast
   */
  async broadcastBitcoinTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { transactionHex, network = 'mainnet' }: BitcoinBroadcastRequest = req.body;

      if (!transactionHex) {
        res.status(400).json({ 
          success: false,
          error: 'Transaction hex is required' 
        });
        return;
      }

      // Broadcast transaction
      const txid = await bitcoinService.broadcastBitcoinTransaction(transactionHex, network);

      res.status(200).json({
        success: true,
        data: {
          txid,
          network,
          explorerUrl: `${bitcoinService.getNetworkConfig(network)?.explorerUrl}/tx/${txid}`
        }
      });

    } catch (error: any) {
      console.error('Broadcast Bitcoin transaction error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to broadcast Bitcoin transaction',
        details: error.message
      });
    }
  }

  /**
   * Get Bitcoin transaction fees
   * GET /api/v1/crypto/wallets/bitcoin/fees
   */
  async getBitcoinTransactionFees(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { network = 'mainnet' } = req.query;

      const fees = await bitcoinService.getBitcoinTransactionFees(network as string);

      res.status(200).json({
        success: true,
        data: {
          network,
          fees,
          unit: 'sat/byte'
        }
      });

    } catch (error: any) {
      console.error('Get Bitcoin transaction fees error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get Bitcoin transaction fees',
        details: error.message
      });
    }
  }

  /**
   * Validate Bitcoin address
   * POST /api/v1/crypto/wallets/bitcoin/validate
   */
  async validateBitcoinAddress(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ 
          success: false,
          error: 'Authentication required' 
        });
        return;
      }

      const { address, network = 'mainnet' } = req.body;

      if (!address) {
        res.status(400).json({ 
          success: false,
          error: 'Bitcoin address is required' 
        });
        return;
      }

      const validation = bitcoinService.validateBitcoinAddress(address, network);

      res.status(200).json({
        success: true,
        data: {
          address,
          network,
          ...validation
        }
      });

    } catch (error: any) {
      console.error('Validate Bitcoin address error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to validate Bitcoin address',
        details: error.message
      });
    }
  }

  /**
   * Get current conversion rates for cryptocurrencies
   * GET /api/v1/crypto/rates
   */
  async getCurrentRates(req: Request, res: Response): Promise<void> {
    try {
      const { currencies } = req.query;
      
      // Default currencies if none specified
      let currencyList: string[] = ['BTC', 'ETH', 'USDT', 'USDC'];
      
      if (currencies) {
        if (typeof currencies === 'string') {
          // Single currency or comma-separated
          currencyList = currencies.split(',').map(c => c.trim().toUpperCase());
        } else if (Array.isArray(currencies)) {
          // Array of currencies
          currencyList = currencies.map(c => String(c).trim().toUpperCase());
        }
      }

      // Validate currency codes
      const validCurrencies = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP'];
      const filteredCurrencies = currencyList.filter(currency => 
        validCurrencies.includes(currency)
      );

      if (filteredCurrencies.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid currencies specified',
          supportedCurrencies: validCurrencies
        });
        return;
      }

      // Get rates from rates service
      const rates: ConversionRates = await ratesService.getCurrentRates(filteredCurrencies);

      res.status(200).json({
        success: true,
        data: {
          rates,
          requestedCurrencies: filteredCurrencies,
          lastUpdated: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('Get current rates error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get conversion rates',
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
    } catch (error: any) {
      console.error('Error updating wallet status:', error);
    }
  }
}

export const cryptoController = new CryptoController();