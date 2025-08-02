import crypto from 'crypto';
import { supabase } from '../../app';
import { privacyService, DeletionProof } from './privacy.service';
import { InputValidator, InputSanitizer } from '../../utils/validators';
import { Card, CreateCardRequest, CardListRequest, CardDetailsResponse, Transaction } from '../../../shared/src/types';

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
      // Insert card with privacy isolation
      const { data: cardRecord, error } = await supabase
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
        cardContext: cardRecord.card_context_hash,
        encryptedCardNumber: cardRecord.encrypted_card_number,
        encryptedCVV: cardRecord.encrypted_cvv,
        expirationDate: cardRecord.expiration_date,
        status: cardRecord.status,
        spendingLimit: cardRecord.spending_limit,
        currentBalance: cardRecord.current_balance,
        createdAt: new Date(cardRecord.created_at),
        expiresAt: cardRecord.expires_at ? new Date(cardRecord.expires_at) : undefined,
        merchantRestrictions: cardRecord.merchant_restrictions,
        deletionKey: cardRecord.deletion_key
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
      let query = supabase
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

      return cards.map(cardRecord => ({
        cardId: cardRecord.card_id,
        cardContext: cardRecord.card_context_hash,
        encryptedCardNumber: cardRecord.encrypted_card_number,
        encryptedCVV: cardRecord.encrypted_cvv,
        expirationDate: cardRecord.expiration_date,
        status: cardRecord.status,
        spendingLimit: cardRecord.spending_limit,
        currentBalance: cardRecord.current_balance,
        createdAt: new Date(cardRecord.created_at),
        expiresAt: cardRecord.expires_at ? new Date(cardRecord.expires_at) : undefined,
        merchantRestrictions: cardRecord.merchant_restrictions,
        deletionKey: cardRecord.deletion_key
      }));
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
      // Get card with privacy isolation check
      const { data: cardRecord, error: cardError } = await supabase
        .from('cards')
        .select('*')
        .eq('card_id', cardId)
        .eq('user_id', userId)
        .single();

      if (cardError || !cardRecord) {
        throw new Error('Card not found');
      }

      // Get transaction history
      const { data: transactions, error: transactionError } = await supabase
        .from('transactions')
        .select('*')
        .eq('card_id', cardId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (transactionError) {
        console.error('Transaction retrieval error:', transactionError);
      }

      const card: Card = {
        cardId: cardRecord.card_id,
        cardContext: cardRecord.card_context_hash,
        encryptedCardNumber: cardRecord.encrypted_card_number,
        encryptedCVV: cardRecord.encrypted_cvv,
        expirationDate: cardRecord.expiration_date,
        status: cardRecord.status,
        spendingLimit: cardRecord.spending_limit,
        currentBalance: cardRecord.current_balance,
        createdAt: new Date(cardRecord.created_at),
        expiresAt: cardRecord.expires_at ? new Date(cardRecord.expires_at) : undefined,
        merchantRestrictions: cardRecord.merchant_restrictions,
        deletionKey: cardRecord.deletion_key
      };

      const transactionHistory: Transaction[] = (transactions || []).map(tx => ({
        id: tx.id,
        user_id: tx.user_id,
        card_id: tx.card_id,
        amount_usd: tx.amount_usd,
        currency: tx.currency,
        merchant_name: tx.merchant_name,
        merchant_category: tx.merchant_category,
        transaction_type: tx.transaction_type,
        status: tx.status,
        created_at: tx.created_at,
        metadata: tx.metadata || {}
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
      const { data: cardRecord, error: cardError } = await supabase
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
      const { error: updateError } = await supabase
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
      const { data: cardRecord, error } = await supabase
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

      return {
        cardId: cardRecord.card_id,
        cardContext: cardRecord.card_context_hash,
        encryptedCardNumber: cardRecord.encrypted_card_number,
        encryptedCVV: cardRecord.encrypted_cvv,
        expirationDate: cardRecord.expiration_date,
        status: cardRecord.status,
        spendingLimit: cardRecord.spending_limit,
        currentBalance: cardRecord.current_balance,
        createdAt: new Date(cardRecord.created_at),
        expiresAt: cardRecord.expires_at ? new Date(cardRecord.expires_at) : undefined,
        merchantRestrictions: cardRecord.merchant_restrictions,
        deletionKey: cardRecord.deletion_key
      };
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
      const { data: cardRecord, error } = await supabase
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