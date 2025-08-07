import { createClient } from '@supabase/supabase-js';
import { Logger } from '../../utils/logger';

interface MerchantRestriction {
  restrictionId: string;
  cardContext: string;
  restrictionType: 'geographic' | 'merchant_category' | 'merchant_name';
  restrictionValue: string;
  isAllowed: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

interface RestrictionValidationResult {
  allowed: boolean;
  reason?: string;
  restrictionType?: string;
  restrictionValue?: string;
}

interface CreateRestrictionRequest {
  cardContext: string;
  restrictionType: 'geographic' | 'merchant_category' | 'merchant_name';
  restrictionValue: string;
  isAllowed: boolean;
  expiresAt?: Date;
}

interface DefaultRestrictionTemplate {
  name: string;
  description: string;
  restrictions: Omit<CreateRestrictionRequest, 'cardContext'>[];
}

export class RestrictionsService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  private logger = new Logger('RestrictionsService');

  // Default restriction templates
  private readonly defaultTemplates: DefaultRestrictionTemplate[] = [
    {
      name: 'Safe Spending',
      description: 'Blocks gambling, adult content, and cash advances',
      restrictions: [
        { restrictionType: 'merchant_category', restrictionValue: '7995', isAllowed: false }, // Gambling
        { restrictionType: 'merchant_category', restrictionValue: '5967', isAllowed: false }, // Adult Content
        { restrictionType: 'merchant_category', restrictionValue: '6010', isAllowed: false }, // Cash Advances
        { restrictionType: 'merchant_category', restrictionValue: '6011', isAllowed: false }  // ATM Cash
      ]
    },
    {
      name: 'US Only',
      description: 'Restricts usage to United States only',
      restrictions: [
        { restrictionType: 'geographic', restrictionValue: 'US', isAllowed: true }
      ]
    },
    {
      name: 'No High-Risk Countries',
      description: 'Blocks transactions in high-risk countries',
      restrictions: [
        { restrictionType: 'geographic', restrictionValue: 'IR', isAllowed: false }, // Iran
        { restrictionType: 'geographic', restrictionValue: 'KP', isAllowed: false }, // North Korea
        { restrictionType: 'geographic', restrictionValue: 'SY', isAllowed: false }, // Syria
        { restrictionType: 'geographic', restrictionValue: 'CU', isAllowed: false }  // Cuba
      ]
    },
    {
      name: 'Essential Services Only',
      description: 'Allows only essential services like groceries, gas, and utilities',
      restrictions: [
        { restrictionType: 'merchant_category', restrictionValue: '5411', isAllowed: true }, // Grocery
        { restrictionType: 'merchant_category', restrictionValue: '5542', isAllowed: true }, // Gas Stations
        { restrictionType: 'merchant_category', restrictionValue: '4900', isAllowed: true }, // Utilities
        { restrictionType: 'merchant_category', restrictionValue: '5912', isAllowed: true }  // Pharmacies
      ]
    }
  ];

  /**
   * Create a new merchant restriction
   */
  async createRestriction(request: CreateRestrictionRequest): Promise<MerchantRestriction> {
    try {
      this.logger.info('Creating merchant restriction', { 
        cardContext: request.cardContext,
        type: request.restrictionType,
        value: request.restrictionValue 
      });

      // Set row-level security context
      await this.setCardContext(request.cardContext);

      // Validate restriction value format
      this.validateRestrictionValue(request.restrictionType, request.restrictionValue);

      const { data: restriction } = await this.supabase
        .from('merchant_restrictions')
        .insert({
          card_context: request.cardContext,
          restriction_type: request.restrictionType,
          restriction_value: request.restrictionValue.toUpperCase(),
          is_allowed: request.isAllowed,
          expires_at: request.expiresAt?.toISOString()
        })
        .select()
        .single();

      if (!restriction) {
        throw new Error('Failed to create restriction');
      }

      const result = this.mapToMerchantRestriction(restriction);
      this.logger.info('Merchant restriction created', { restrictionId: result.restrictionId });

      return result;
    } catch (error) {
      this.logger.error('Failed to create merchant restriction', { error, request });
      throw error;
    }
  }

  /**
   * Get all restrictions for a card
   */
  async getCardRestrictions(cardContext: string): Promise<MerchantRestriction[]> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const { data: restrictions } = await this.supabase
        .from('merchant_restrictions')
        .select('*')
        .eq('card_context', cardContext)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false });

      return (restrictions || []).map(this.mapToMerchantRestriction);
    } catch (error) {
      this.logger.error('Failed to get card restrictions', { error, cardContext });
      throw error;
    }
  }

  /**
   * Delete a restriction
   */
  async deleteRestriction(cardContext: string, restrictionId: string): Promise<void> {
    try {
      this.logger.info('Deleting merchant restriction', { cardContext, restrictionId });

      // Set row-level security context
      await this.setCardContext(cardContext);

      const { error } = await this.supabase
        .from('merchant_restrictions')
        .delete()
        .eq('restriction_id', restrictionId)
        .eq('card_context', cardContext);

      if (error) {
        throw error;
      }

      this.logger.info('Merchant restriction deleted', { restrictionId });
    } catch (error) {
      this.logger.error('Failed to delete merchant restriction', { error, restrictionId });
      throw error;
    }
  }

  /**
   * Apply default restriction template to card
   */
  async applyTemplate(cardContext: string, templateName: string): Promise<MerchantRestriction[]> {
    try {
      this.logger.info('Applying restriction template', { cardContext, templateName });

      const template = this.defaultTemplates.find(t => t.name === templateName);
      if (!template) {
        throw new Error(`Template '${templateName}' not found`);
      }

      const createdRestrictions: MerchantRestriction[] = [];

      for (const restriction of template.restrictions) {
        const created = await this.createRestriction({
          ...restriction,
          cardContext
        });
        createdRestrictions.push(created);
      }

      this.logger.info('Restriction template applied', { 
        templateName, 
        restrictionCount: createdRestrictions.length 
      });

      return createdRestrictions;
    } catch (error) {
      this.logger.error('Failed to apply restriction template', { error, cardContext, templateName });
      throw error;
    }
  }

  /**
   * Get available restriction templates
   */
  getAvailableTemplates(): DefaultRestrictionTemplate[] {
    return this.defaultTemplates;
  }

  /**
   * Validate transaction against card restrictions
   */
  async validateTransaction(
    cardContext: string, 
    merchantCategoryCode: string, 
    countryCode: string,
    merchantName?: string
  ): Promise<RestrictionValidationResult> {
    try {
      // Set row-level security context
      await this.setCardContext(cardContext);

      const restrictions = await this.getCardRestrictions(cardContext);

      // If no restrictions, allow transaction
      if (restrictions.length === 0) {
        return { allowed: true };
      }

      // Check geographic restrictions
      const geographicResult = this.validateGeographicRestrictions(restrictions, countryCode);
      if (!geographicResult.allowed) {
        return geographicResult;
      }

      // Check merchant category restrictions
      const categoryResult = this.validateCategoryRestrictions(restrictions, merchantCategoryCode);
      if (!categoryResult.allowed) {
        return categoryResult;
      }

      // Check merchant name restrictions (if provided)
      if (merchantName) {
        const nameResult = this.validateNameRestrictions(restrictions, merchantName);
        if (!nameResult.allowed) {
          return nameResult;
        }
      }

      return { allowed: true };
    } catch (error) {
      this.logger.error('Failed to validate transaction restrictions', { 
        error, 
        cardContext, 
        merchantCategoryCode, 
        countryCode 
      });
      
      // Fail safe - allow transaction if validation fails
      return { allowed: true };
    }
  }

  /**
   * Bulk update restrictions for a card
   */
  async bulkUpdateRestrictions(
    cardContext: string, 
    restrictions: Omit<CreateRestrictionRequest, 'cardContext'>[]
  ): Promise<MerchantRestriction[]> {
    try {
      this.logger.info('Bulk updating restrictions', { cardContext, count: restrictions.length });

      // Set row-level security context
      await this.setCardContext(cardContext);

      // Delete existing restrictions
      await this.supabase
        .from('merchant_restrictions')
        .delete()
        .eq('card_context', cardContext);

      // Create new restrictions
      const createdRestrictions: MerchantRestriction[] = [];
      
      for (const restriction of restrictions) {
        const created = await this.createRestriction({
          ...restriction,
          cardContext
        });
        createdRestrictions.push(created);
      }

      this.logger.info('Bulk update completed', { count: createdRestrictions.length });
      return createdRestrictions;
    } catch (error) {
      this.logger.error('Failed to bulk update restrictions', { error, cardContext });
      throw error;
    }
  }

  /**
   * Get merchant category code information
   */
  getMerchantCategoryInfo(mcc: string): { name: string; description: string; riskLevel: string } {
    const mccDatabase: Record<string, { name: string; description: string; riskLevel: string }> = {
      '5411': { name: 'Grocery Stores', description: 'Supermarkets and grocery stores', riskLevel: 'low' },
      '5542': { name: 'Gas Stations', description: 'Automated fuel dispensers', riskLevel: 'low' },
      '4900': { name: 'Utilities', description: 'Electric, gas, water, and other utilities', riskLevel: 'low' },
      '5912': { name: 'Drug Stores', description: 'Pharmacies and drug stores', riskLevel: 'low' },
      '5814': { name: 'Fast Food', description: 'Quick service restaurants', riskLevel: 'low' },
      '5812': { name: 'Restaurants', description: 'Full service restaurants', riskLevel: 'low' },
      '7995': { name: 'Gambling', description: 'Gambling and betting services', riskLevel: 'high' },
      '5967': { name: 'Adult Content', description: 'Adult entertainment services', riskLevel: 'high' },
      '6010': { name: 'Cash Advances', description: 'Manual cash disbursements', riskLevel: 'high' },
      '6011': { name: 'ATM Cash', description: 'Automated cash disbursements', riskLevel: 'medium' },
      '5999': { name: 'Miscellaneous', description: 'Other retail stores', riskLevel: 'medium' }
    };

    return mccDatabase[mcc] || { 
      name: 'Unknown', 
      description: `MCC ${mcc}`, 
      riskLevel: 'medium' 
    };
  }

  /**
   * Private: Validate geographic restrictions
   */
  private validateGeographicRestrictions(
    restrictions: MerchantRestriction[], 
    countryCode: string
  ): RestrictionValidationResult {
    const geoRestrictions = restrictions.filter(r => r.restrictionType === 'geographic');
    
    if (geoRestrictions.length === 0) {
      return { allowed: true };
    }

    // Check for explicit blocks
    const blocked = geoRestrictions.find(r => 
      !r.isAllowed && r.restrictionValue === countryCode.toUpperCase()
    );
    
    if (blocked) {
      return {
        allowed: false,
        reason: `Transactions blocked in ${countryCode}`,
        restrictionType: 'geographic',
        restrictionValue: countryCode
      };
    }

    // Check for allowlist (if any allowlist exists, country must be on it)
    const allowedCountries = geoRestrictions.filter(r => r.isAllowed);
    
    if (allowedCountries.length > 0) {
      const isAllowed = allowedCountries.some(r => r.restrictionValue === countryCode.toUpperCase());
      
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Transactions only allowed in specified countries`,
          restrictionType: 'geographic',
          restrictionValue: countryCode
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Private: Validate merchant category restrictions
   */
  private validateCategoryRestrictions(
    restrictions: MerchantRestriction[], 
    merchantCategoryCode: string
  ): RestrictionValidationResult {
    const categoryRestrictions = restrictions.filter(r => r.restrictionType === 'merchant_category');
    
    if (categoryRestrictions.length === 0) {
      return { allowed: true };
    }

    // Check for explicit blocks
    const blocked = categoryRestrictions.find(r => 
      !r.isAllowed && r.restrictionValue === merchantCategoryCode
    );
    
    if (blocked) {
      const categoryInfo = this.getMerchantCategoryInfo(merchantCategoryCode);
      return {
        allowed: false,
        reason: `Transactions blocked for ${categoryInfo.name}`,
        restrictionType: 'merchant_category',
        restrictionValue: merchantCategoryCode
      };
    }

    // Check for allowlist (if any allowlist exists, MCC must be on it)
    const allowedCategories = categoryRestrictions.filter(r => r.isAllowed);
    
    if (allowedCategories.length > 0) {
      const isAllowed = allowedCategories.some(r => r.restrictionValue === merchantCategoryCode);
      
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Transactions only allowed for specified merchant categories`,
          restrictionType: 'merchant_category',
          restrictionValue: merchantCategoryCode
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Private: Validate merchant name restrictions
   */
  private validateNameRestrictions(
    restrictions: MerchantRestriction[], 
    merchantName: string
  ): RestrictionValidationResult {
    const nameRestrictions = restrictions.filter(r => r.restrictionType === 'merchant_name');
    
    if (nameRestrictions.length === 0) {
      return { allowed: true };
    }

    const merchantNameUpper = merchantName.toUpperCase();

    // Check for explicit blocks (partial match)
    const blocked = nameRestrictions.find(r => 
      !r.isAllowed && merchantNameUpper.includes(r.restrictionValue)
    );
    
    if (blocked) {
      return {
        allowed: false,
        reason: `Transactions blocked for ${merchantName}`,
        restrictionType: 'merchant_name',
        restrictionValue: merchantName
      };
    }

    // Check for allowlist (if any allowlist exists, merchant must match)
    const allowedMerchants = nameRestrictions.filter(r => r.isAllowed);
    
    if (allowedMerchants.length > 0) {
      const isAllowed = allowedMerchants.some(r => 
        merchantNameUpper.includes(r.restrictionValue)
      );
      
      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Transactions only allowed for specified merchants`,
          restrictionType: 'merchant_name',
          restrictionValue: merchantName
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Private: Validate restriction value format
   */
  private validateRestrictionValue(type: string, value: string): void {
    switch (type) {
      case 'geographic':
        if (!/^[A-Z]{2}$/.test(value.toUpperCase())) {
          throw new Error('Geographic restriction must be a 2-letter country code');
        }
        break;
      
      case 'merchant_category':
        if (!/^\d{4}$/.test(value)) {
          throw new Error('Merchant category restriction must be a 4-digit MCC code');
        }
        break;
      
      case 'merchant_name':
        if (value.length < 2 || value.length > 50) {
          throw new Error('Merchant name restriction must be 2-50 characters');
        }
        break;
      
      default:
        throw new Error(`Invalid restriction type: ${type}`);
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
   * Private: Map database record to MerchantRestriction interface
   */
  private mapToMerchantRestriction(dbRecord: any): MerchantRestriction {
    return {
      restrictionId: dbRecord.restriction_id,
      cardContext: dbRecord.card_context,
      restrictionType: dbRecord.restriction_type,
      restrictionValue: dbRecord.restriction_value,
      isAllowed: dbRecord.is_allowed,
      createdAt: new Date(dbRecord.created_at),
      expiresAt: dbRecord.expires_at ? new Date(dbRecord.expires_at) : undefined
    };
  }
}