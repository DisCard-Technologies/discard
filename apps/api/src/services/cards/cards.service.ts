import crypto from 'crypto';
import { supabase } from '../../app';
import { privacyService, DeletionProof } from './privacy.service';
import { InputValidator, InputSanitizer } from '../../utils/validators';
import { Card, CreateCardRequest, CardListRequest, CardDetailsResponse, Transaction } from '@discard/shared/src/types/index';
import { createClient } from '@supabase/supabase-js';

export interface CreateCardData {
  userId: string;
  spendingLimit: number;
  expirationDate?: string;
  merchantRestrictions?: string[];
}

export interface CardWithCredentials {
  card: Card;
  cardNumber: string;
  cvv: string;
}

export class CardsService {
  /**
   * Get Supabase service role client for admin operations
   * This bypasses RLS policies for system operations
   */
  private getServiceRoleClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase service role configuration');
    }
    
    return createClient(supabaseUrl, supabaseServiceKey);
  }
  /**
   * Map database card record to API Card interface
   */
  private mapCardRecord(cardRecord: any): Card {
    return {
      cardId: cardRecord.card_id,
      userId: cardRecord.user_id,
      status: cardRecord.status,
      spendingLimit: cardRecord.spending_limit,
      currentBalance: cardRecord.current_balance,
      merchantRestrictions: cardRecord.merchant_restrictions,
      createdAt: cardRecord.created_at,
      expiresAt: cardRecord.expires_at || new Date(Date.now() + (2 * 365 * 24 * 60 * 60 * 1000)).toISOString()
    };
  }

  /**
   * Create a new disposable virtual card with privacy isolation
   */
  async createCard(data: CreateCardData): Promise<CardWithCredentials> {
    const { userId, spendingLimit, expirationDate, merchantRestrictions } = data;

    // Validate spending limit
    const limitValidation = privacyService.validateSpendingLimit(spendingLimit);
    if (!limitValidation.valid) {
      throw new Error(limitValidation.message || 'Invalid spending limit');
    }

    // Generate card credentials
    const { cardNumber, cvv } = privacyService.generateCardCredentials();
    
    // Generate privacy isolation context
    const cardContext = privacyService.generateCardContext(userId);
    
    // Generate deletion key for cryptographic verification
    const cardId = crypto.randomUUID();
    const deletionKey = privacyService.generateDeletionKey(cardId);
    
    // Encrypt sensitive data
    const encryptedCardNumber = privacyService.encryptCardData(cardNumber, cardId);
    const encryptedCVV = privacyService.encryptCardData(cvv, cardId);
    
    // Calculate expiration date
    const expiresAt = expirationDate 
      ? this.parseExpirationDate(expirationDate)
      : new Date(Date.now() + (2 * 365 * 24 * 60 * 60 * 1000)); // 2 years default

    try {
      // Insert card with privacy isolation using service role to bypass RLS
      const serviceClient = this.getServiceRoleClient();
      const { data: cardRecord, error } = await serviceClient
        .from('cards')
        .insert([{
          card_id: cardId,
          user_id: userId,
          card_context_hash: cardContext,
          encrypted_card_number: encryptedCardNumber,
          encrypted_cvv: encryptedCVV,
          expiration_date: this.formatExpirationDate(expiresAt),
          status: 'active',
          spending_limit: spendingLimit,
          current_balance: 0,
          expires_at: expiresAt.toISOString(),
          merchant_restrictions: merchantRestrictions || null,
          deletion_key: deletionKey,
          created_at: new Date().toISOString()
        }])
        .select('*')
        .single();

      if (error) {
        console.error('Card creation error:', error);
        throw new Error('Failed to create card');
      }

      const card: Card = {
        cardId: cardRecord.card_id,
        userId: cardRecord.user_id,
        status: cardRecord.status,
        spendingLimit: cardRecord.spending_limit,
        currentBalance: cardRecord.current_balance,
        merchantRestrictions: cardRecord.merchant_restrictions,
        createdAt: cardRecord.created_at,
        expiresAt: cardRecord.expires_at || new Date(Date.now() + (2 * 365 * 24 * 60 * 60 * 1000)).toISOString()
      };

      return {
        card,
        cardNumber,
        cvv
      };
    } catch (error) {
      console.error('Card creation failed:', error);
      throw new Error('Failed to create card');
    }
  }

  /**
   * List user's cards with privacy isolation
   */
  async listCards(userId: string, options: CardListRequest = {}): Promise<Card[]> {
    const { status, limit = 50 } = options;
    
    // Validate limit
    const requestLimit = Math.min(limit, 50);
    
    try {
      // Use service role client for admin operations
      const serviceClient = this.getServiceRoleClient();
      let query = serviceClient
        .from('cards')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(requestLimit);

      if (status) {
        query = query.eq('status', status);
      }

      const { data: cards, error } = await query;

      if (error) {
        console.error('Card listing error:', error);
        throw new Error('Failed to retrieve cards');
      }

      return cards.map(cardRecord => this.mapCardRecord(cardRecord));
    } catch (error) {
      console.error('Card listing failed:', error);
      throw new Error('Failed to retrieve cards');
    }
  }

  /**
   * Get card details with transaction history
   */
  async getCardDetails(userId: string, cardId: string): Promise<CardDetailsResponse> {
    try {
      // Get card with privacy isolation check using service role
      const serviceClient = this.getServiceRoleClient();
      const { data: cardRecord, error: cardError } = await serviceClient
        .from('cards')
        .select('*')
        .eq('card_id', cardId)
        .eq('user_id', userId)
        .single();

      if (cardError || !cardRecord) {
        throw new Error('Card not found');
      }

      // Get transaction history
      const { data: transactions, error: transactionError } = await serviceClient
        .from('transactions')
        .select('*')
        .eq('card_id', cardId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (transactionError) {
        console.error('Transaction retrieval error:', transactionError);
      }

      const card = this.mapCardRecord(cardRecord);

      const transactionHistory: Transaction[] = (transactions || []).map(tx => ({
        id: tx.id,
        cardId: tx.card_id,
        amount: tx.amount_usd,
        merchant: tx.merchant_name,
        timestamp: tx.created_at,
        status: tx.status
      }));

      return {
        card,
        transactionHistory
      };
    } catch (error) {
      console.error('Card details retrieval failed:', error);
      throw new Error('Failed to retrieve card details');
    }
  }

  /**
   * Delete card with cryptographic verification
   */
  async deleteCard(userId: string, cardId: string): Promise<DeletionProof> {
    try {
      // Verify card ownership and get deletion key
      const serviceClient = this.getServiceRoleClient();
      const { data: cardRecord, error: cardError } = await serviceClient
        .from('cards')
        .select('card_id, deletion_key, status')
        .eq('card_id', cardId)
        .eq('user_id', userId)
        .single();

      if (cardError || !cardRecord) {
        throw new Error('Card not found');
      }

      if (cardRecord.status === 'deleted') {
        throw new Error('Card is already deleted');
      }

      // Create deletion proof
      const deletionProof = privacyService.createDeletionProof(cardId, cardRecord.deletion_key);

      // Update card status to deleted
      const { error: updateError } = await serviceClient
        .from('cards')
        .update({
          status: 'deleted',
          updated_at: new Date().toISOString()
        })
        .eq('card_id', cardId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Card deletion error:', updateError);
        throw new Error('Failed to delete card');
      }

      // Log deletion for audit trail
      await privacyService.logCardDeletion(cardId, deletionProof);

      return deletionProof;
    } catch (error) {
      console.error('Card deletion failed:', error);
      throw new Error('Failed to delete card');
    }
  }

  /**
   * Update card status (pause/resume)
   */
  async updateCardStatus(userId: string, cardId: string, status: 'active' | 'paused'): Promise<Card> {
    try {
      const serviceClient = this.getServiceRoleClient();
      const { data: cardRecord, error } = await serviceClient
        .from('cards')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('card_id', cardId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error || !cardRecord) {
        throw new Error('Failed to update card status');
      }

      return this.mapCardRecord(cardRecord);
    } catch (error) {
      console.error('Card status update failed:', error);
      throw new Error('Failed to update card status');
    }
  }

  /**
   * Get decrypted card credentials for secure display
   */
  async getCardCredentials(userId: string, cardId: string): Promise<{ cardNumber: string; cvv: string }> {
    try {
      const serviceClient = this.getServiceRoleClient();
      const { data: cardRecord, error } = await serviceClient
        .from('cards')
        .select('encrypted_card_number, encrypted_cvv')
        .eq('card_id', cardId)
        .eq('user_id', userId)
        .single();

      if (error || !cardRecord) {
        throw new Error('Card not found');
      }

      const cardNumber = privacyService.decryptCardData(cardRecord.encrypted_card_number, cardId);
      const cvv = privacyService.decryptCardData(cardRecord.encrypted_cvv, cardId);

      return { cardNumber, cvv };
    } catch (error) {
      console.error('Card credentials retrieval failed:', error);
      throw new Error('Failed to retrieve card credentials');
    }
  }

  /**
   * Parse expiration date from MMYY format
   */
  private parseExpirationDate(expirationDate: string): Date {
    if (!/^\d{4}$/.test(expirationDate)) {
      throw new Error('Invalid expiration date format. Use MMYY');
    }

    const month = parseInt(expirationDate.substring(0, 2), 10);
    const year = parseInt(expirationDate.substring(2, 4), 10) + 2000;

    if (month < 1 || month > 12) {
      throw new Error('Invalid month in expiration date');
    }

    const date = new Date(year, month - 1, 1);
    // Set to last day of the month
    date.setMonth(month, 0);
    date.setHours(23, 59, 59, 999);

    return date;
  }

  /**
   * Format date to MMYY string
   */
  private formatExpirationDate(date: Date): string {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().substring(2);
    return month + year;
  }
}

export const cardsService = new CardsService();