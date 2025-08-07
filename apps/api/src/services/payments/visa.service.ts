import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { MarqetaService } from './marqeta.service';
import { Logger } from '../../utils/logger';

interface VisaCardDetails {
  visaCardId: string;
  cardId: string;
  cardContext: string;
  marqetaCardToken: string;
  encryptedCardNumber: string;
  encryptedCvv: string;
  expirationMonth: number;
  expirationYear: number;
  binNumber: string;
  cardNetwork: string;
  provisioningStatus: string;
  lastFourDigits: string;
  activationDate: string | null;
  networkRegistrationId: string | null;
}

interface CardGenerationRequest {
  cardId: string;
  cardContext: string;
  userToken: string;
  metadata?: Record<string, any>;
}

interface CardActivationRequest {
  cardContext: string;
  marqetaCardToken: string;
}

interface NetworkHealthStatus {
  isHealthy: boolean;
  responseTime: number;
  status: string;
  lastChecked: string;
}

export class VisaService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private marqetaService = new MarqetaService();
  private logger = new Logger('VisaService');
  private readonly encryptionKey: string;
  private readonly sandboxBin = '554948';

  constructor() {
    const key = process.env.CARD_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('Card encryption key not configured');
    }
    this.encryptionKey = key;
  }

  /**
   * Generate and provision a new Visa card
   */
  async generateCard(request: CardGenerationRequest): Promise<VisaCardDetails> {
    try {
      this.logger.info('Generating new Visa card', { cardId: request.cardId, cardContext: request.cardContext });

      // Set row-level security context
      await this.setCardContext(request.cardContext);

      // Create card in Marqeta
      const marqetaCard = await this.marqetaService.createCard(
        request.cardContext,
        request.userToken,
        request.metadata
      );

      // Extract card details
      const cardNumber = marqetaCard.pan;
      const cvv = marqetaCard.cvv_number;
      const lastFour = marqetaCard.last_four;

      // Parse expiration date
      const { month, year } = this.parseExpirationDate(marqetaCard.expiration);

      // Encrypt sensitive data
      const encryptedCardNumber = this.encryptData(cardNumber);
      const encryptedCvv = this.encryptData(cvv);

      // Store in database
      const visaCardDetails = await this.storeCardDetails({
        cardId: request.cardId,
        cardContext: request.cardContext,
        marqetaCardToken: marqetaCard.token,
        encryptedCardNumber,
        encryptedCvv,
        expirationMonth: month,
        expirationYear: year,
        binNumber: this.determineBinNumber(),
        lastFourDigits: lastFour,
        provisioningStatus: 'active'
      });

      this.logger.info('Visa card generated successfully', { 
        visaCardId: visaCardDetails.visaCardId,
        marqetaToken: marqetaCard.token,
        lastFour
      });

      return visaCardDetails;
    } catch (error) {
      this.logger.error('Failed to generate Visa card', { error, request });
      throw error;
    }
  }

  /**
   * Activate a provisioned card
   */
  async activateCard(request: CardActivationRequest): Promise<VisaCardDetails> {
    try {
      this.logger.info('Activating Visa card', request);

      // Set row-level security context
      await this.setCardContext(request.cardContext);

      // Activate in Marqeta
      const marqetaCard = await this.marqetaService.activateCard(
        request.cardContext,
        request.marqetaCardToken
      );

      // Update database with activation
      const { data: updatedCard } = await this.supabase
        .from('visa_card_details')
        .update({
          provisioning_status: 'active',
          activation_date: new Date().toISOString(),
          network_registration_id: this.generateNetworkRegistrationId()
        })
        .eq('marqeta_card_token', request.marqetaCardToken)
        .eq('card_context', request.cardContext)
        .select()
        .single();

      if (!updatedCard) {
        throw new Error('Card not found or access denied');
      }

      this.logger.info('Visa card activated successfully', { 
        marqetaToken: request.marqetaCardToken,
        state: marqetaCard.state 
      });

      return this.mapToVisaCardDetails(updatedCard);
    } catch (error) {
      this.logger.error('Failed to activate Visa card', { error, request });
      throw error;
    }
  }

  /**
   * Get card details by card context
   */
  async getCardDetails(cardContext: string): Promise<VisaCardDetails | null> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const { data: cardDetails } = await this.supabase
        .from('visa_card_details')
        .select('*')
        .eq('card_context', cardContext)
        .single();

      if (!cardDetails) {
        return null;
      }

      return this.mapToVisaCardDetails(cardDetails);
    } catch (error) {
      this.logger.error('Failed to get card details', { error, cardContext });
      throw error;
    }
  }

  /**
   * Get decrypted card number for display (temporary exposure)
   */
  async getDecryptedCardNumber(cardContext: string): Promise<string> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const { data: cardDetails } = await this.supabase
        .from('visa_card_details')
        .select('encrypted_card_number')
        .eq('card_context', cardContext)
        .single();

      if (!cardDetails) {
        throw new Error('Card not found');
      }

      const decryptedNumber = this.decryptData(cardDetails.encrypted_card_number);
      
      // Log access for security audit
      this.logger.info('Card number decrypted', { 
        cardContext,
        timestamp: new Date().toISOString()
      });

      return decryptedNumber;
    } catch (error) {
      this.logger.error('Failed to decrypt card number', { error, cardContext });
      throw error;
    }
  }

  /**
   * Get decrypted CVV for display (temporary exposure)
   */
  async getDecryptedCvv(cardContext: string): Promise<string> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const { data: cardDetails } = await this.supabase
        .from('visa_card_details')
        .select('encrypted_cvv')
        .eq('card_context', cardContext)
        .single();

      if (!cardDetails) {
        throw new Error('Card not found');
      }

      const decryptedCvv = this.decryptData(cardDetails.encrypted_cvv);
      
      // Log access for security audit
      this.logger.info('CVV decrypted', { 
        cardContext,
        timestamp: new Date().toISOString()
      });

      return decryptedCvv;
    } catch (error) {
      this.logger.error('Failed to decrypt CVV', { error, cardContext });
      throw error;
    }
  }

  /**
   * Suspend a card
   */
  async suspendCard(cardContext: string): Promise<VisaCardDetails> {
    try {
      this.logger.info('Suspending Visa card', { cardContext });

      // Set row-level security context
      await this.setCardContext(cardContext);

      // Get card details
      const cardDetails = await this.getCardDetails(cardContext);
      if (!cardDetails) {
        throw new Error('Card not found');
      }

      // Suspend in Marqeta
      await this.marqetaService.suspendCard(cardContext, cardDetails.marqetaCardToken);

      // Update database
      const { data: updatedCard } = await this.supabase
        .from('visa_card_details')
        .update({
          provisioning_status: 'suspended'
        })
        .eq('card_context', cardContext)
        .select()
        .single();

      return this.mapToVisaCardDetails(updatedCard);
    } catch (error) {
      this.logger.error('Failed to suspend Visa card', { error, cardContext });
      throw error;
    }
  }

  /**
   * Terminate a card (permanent)
   */
  async terminateCard(cardContext: string): Promise<VisaCardDetails> {
    try {
      this.logger.info('Terminating Visa card', { cardContext });

      // Set row-level security context
      await this.setCardContext(cardContext);

      // Get card details
      const cardDetails = await this.getCardDetails(cardContext);
      if (!cardDetails) {
        throw new Error('Card not found');
      }

      // Terminate in Marqeta
      await this.marqetaService.terminateCard(cardContext, cardDetails.marqetaCardToken);

      // Update database
      const { data: updatedCard } = await this.supabase
        .from('visa_card_details')
        .update({
          provisioning_status: 'terminated',
          deactivation_date: new Date().toISOString()
        })
        .eq('card_context', cardContext)
        .select()
        .single();

      return this.mapToVisaCardDetails(updatedCard);
    } catch (error) {
      this.logger.error('Failed to terminate Visa card', { error, cardContext });
      throw error;
    }
  }

  /**
   * Check network status and health
   */
  async checkNetworkStatus(): Promise<NetworkHealthStatus> {
    try {
      const marqetaHealth = await this.marqetaService.checkNetworkHealth();

      const status: NetworkHealthStatus = {
        isHealthy: marqetaHealth.isHealthy,
        responseTime: marqetaHealth.responseTime,
        status: marqetaHealth.status,
        lastChecked: new Date().toISOString()
      };

      this.logger.info('Network health check completed', status);
      return status;
    } catch (error) {
      this.logger.error('Network health check failed', { error });
      
      return {
        isHealthy: false,
        responseTime: 0,
        status: 'Health check failed',
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * Get card provisioning status
   */
  async getProvisioningStatus(cardContext: string): Promise<any[]> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const { data: statuses } = await this.supabase
        .from('card_provisioning_status')
        .select('*')
        .eq('card_context', cardContext)
        .order('created_at', { ascending: false });

      return statuses || [];
    } catch (error) {
      this.logger.error('Failed to get provisioning status', { error, cardContext });
      throw error;
    }
  }

  /**
   * Private: Set row-level security context
   */
  private async setCardContext(cardContext: string): Promise<void> {
    await this.supabase.rpc('set_config', {
      setting_name: 'app.current_card_context',
      new_value: cardContext,
      is_local: true
    });
  }

  /**
   * Private: Store card details in database
   */
  private async storeCardDetails(details: {
    cardId: string;
    cardContext: string;
    marqetaCardToken: string;
    encryptedCardNumber: string;
    encryptedCvv: string;
    expirationMonth: number;
    expirationYear: number;
    binNumber: string;
    lastFourDigits: string;
    provisioningStatus: string;
  }): Promise<VisaCardDetails> {
    const { data: insertedCard } = await this.supabase
      .from('visa_card_details')
      .insert({
        card_id: details.cardId,
        card_context: details.cardContext,
        marqeta_card_token: details.marqetaCardToken,
        encrypted_card_number: details.encryptedCardNumber,
        encrypted_cvv: details.encryptedCvv,
        expiration_month: details.expirationMonth,
        expiration_year: details.expirationYear,
        bin_number: details.binNumber,
        last_four_digits: details.lastFourDigits,
        provisioning_status: details.provisioningStatus,
        activation_date: new Date().toISOString()
      })
      .select()
      .single();

    if (!insertedCard) {
      throw new Error('Failed to store card details');
    }

    return this.mapToVisaCardDetails(insertedCard);
  }

  /**
   * Private: Encrypt sensitive data
   */
  private encryptData(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Private: Decrypt sensitive data
   */
  private decryptData(encryptedData: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Private: Parse Marqeta expiration date format
   */
  private parseExpirationDate(expiration: string): { month: number; year: number } {
    // Marqeta format is typically "MMYY"
    if (expiration.length === 4) {
      const month = parseInt(expiration.substring(0, 2), 10);
      const year = parseInt('20' + expiration.substring(2, 4), 10);
      return { month, year };
    }
    
    // Fallback: generate default expiration (3 years from now)
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear() + 3;
    return { month, year };
  }

  /**
   * Private: Determine BIN number (sandbox vs production)
   */
  private determineBinNumber(): string {
    const environment = process.env.NODE_ENV || 'development';
    return environment === 'production' 
      ? process.env.MARQETA_PRODUCTION_BIN || this.sandboxBin
      : this.sandboxBin;
  }

  /**
   * Private: Generate network registration ID
   */
  private generateNetworkRegistrationId(): string {
    return 'VISA_' + crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  /**
   * Private: Map database record to VisaCardDetails interface
   */
  private mapToVisaCardDetails(dbRecord: any): VisaCardDetails {
    return {
      visaCardId: dbRecord.visa_card_id,
      cardId: dbRecord.card_id,
      cardContext: dbRecord.card_context,
      marqetaCardToken: dbRecord.marqeta_card_token,
      encryptedCardNumber: dbRecord.encrypted_card_number,
      encryptedCvv: dbRecord.encrypted_cvv,
      expirationMonth: dbRecord.expiration_month,
      expirationYear: dbRecord.expiration_year,
      binNumber: dbRecord.bin_number,
      cardNetwork: dbRecord.card_network || 'VISA',
      provisioningStatus: dbRecord.provisioning_status,
      lastFourDigits: dbRecord.last_four_digits,
      activationDate: dbRecord.activation_date,
      networkRegistrationId: dbRecord.network_registration_id
    };
  }
}