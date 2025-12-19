/**
 * Card Creation Screen for React Native
 * Allows users to create new disposable virtual cards with custom settings
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
// Use Convex-based cards store
import { useCardOperations, CreateCardRequest } from '../../stores/cardsConvex';

// Local formatUSD helper (was from @discard/shared)
function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

interface CardCreationScreenProps {
  onCardCreated?: (card: any) => void;
  onCancel?: () => void;
}

const CardCreationScreen: React.FC<CardCreationScreenProps> = ({
  onCardCreated,
  onCancel,
}) => {
  const cardOperations = useCardOperations();
  
  // Form state
  const [spendingLimit, setSpendingLimit] = useState('100');
  const [useCustomExpiration, setUseCustomExpiration] = useState(false);
  const [expirationMonths, setExpirationMonths] = useState('12');
  const [merchantRestrictions, setMerchantRestrictions] = useState<string[]>([]);
  const [customMerchant, setCustomMerchant] = useState('');
  const [geographicRestrictions, setGeographicRestrictions] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Predefined merchant categories (updated with more comprehensive list)
  const merchantCategories = [
    { code: '5411', name: 'Grocery Stores', riskLevel: 'low' },
    { code: '5812', name: 'Restaurants', riskLevel: 'low' },
    { code: '5542', name: 'Gas Stations', riskLevel: 'low' },
    { code: '4900', name: 'Utilities', riskLevel: 'low' },
    { code: '5912', name: 'Pharmacies', riskLevel: 'low' },
    { code: '5691', name: 'Clothing Stores', riskLevel: 'medium' },
    { code: '5732', name: 'Electronics', riskLevel: 'medium' },
    { code: '5999', name: 'Online Shopping', riskLevel: 'medium' },
    { code: '7995', name: 'Gambling', riskLevel: 'high' },
    { code: '5967', name: 'Adult Content', riskLevel: 'high' },
    { code: '6010', name: 'Cash Advances', riskLevel: 'high' },
    { code: '6011', name: 'ATM Withdrawals', riskLevel: 'medium' },
  ];

  // Geographic restrictions (countries)
  const commonCountries = [
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'FR', name: 'France' },
    { code: 'DE', name: 'Germany' },
    { code: 'JP', name: 'Japan' },
    { code: 'AU', name: 'Australia' },
    { code: 'SG', name: 'Singapore' },
  ];

  // Restriction templates
  const restrictionTemplates = [
    { name: 'Safe Spending', description: 'Blocks gambling, adult content, and cash advances' },
    { name: 'US Only', description: 'Restricts usage to United States only' },
    { name: 'No High-Risk Countries', description: 'Blocks transactions in high-risk countries' },
    { name: 'Essential Services Only', description: 'Allows only groceries, gas, utilities, and pharmacies' },
  ];

  const validateForm = (): string | null => {
    const limitValue = parseInt(spendingLimit);
    
    if (isNaN(limitValue) || limitValue < 100) {
      return 'Spending limit must be at least $1.00';
    }
    
    if (limitValue > 500000) {
      return 'Spending limit cannot exceed $5,000.00';
    }

    if (useCustomExpiration) {
      const months = parseInt(expirationMonths);
      if (isNaN(months) || months < 1 || months > 60) {
        return 'Expiration must be between 1 and 60 months';
      }
    }

    return null;
  };

  const handleCreateCard = async () => {
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('Validation Error', validationError);
      return;
    }

    setIsCreating(true);

    try {
      const cardData: CreateCardRequest = {
        spendingLimit: parseInt(spendingLimit) * 100, // Convert to cents
        merchantRestrictions: merchantRestrictions.length > 0 ? merchantRestrictions : undefined,
      };

      if (useCustomExpiration) {
        const expirationDate = new Date();
        expirationDate.setMonth(expirationDate.getMonth() + parseInt(expirationMonths));
        cardData.expirationDate = expirationDate.toISOString();
      }

      const newCard = await cardOperations.createCard(cardData);
      
      if (newCard) {
        Alert.alert(
          'Card Created Successfully!',
          'Your new virtual card has been created. Card details are temporarily visible for copying.',
          [
            {
              text: 'OK',
              onPress: () => {
                if (onCardCreated) {
                  onCardCreated(newCard);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to create card. Please try again.');
      }
    } catch (error) {
      Alert.alert(
        'Creation Failed',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleSpendingLimitChange = (text: string) => {
    // Remove non-numeric characters
    const numericValue = text.replace(/[^0-9]/g, '');
    setSpendingLimit(numericValue);
  };

  const toggleMerchantRestriction = (code: string) => {
    if (merchantRestrictions.includes(code)) {
      setMerchantRestrictions(merchantRestrictions.filter(c => c !== code));
    } else {
      setMerchantRestrictions([...merchantRestrictions, code]);
    }
  };

  const addCustomMerchant = () => {
    const trimmed = customMerchant.trim();
    if (trimmed && !merchantRestrictions.includes(trimmed)) {
      setMerchantRestrictions([...merchantRestrictions, trimmed]);
      setCustomMerchant('');
    }
  };

  const removeMerchantRestriction = (code: string) => {
    setMerchantRestrictions(merchantRestrictions.filter(c => c !== code));
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create New Card</Text>
            <Text style={styles.subtitle}>
              Set up your disposable virtual card with custom privacy settings
            </Text>
          </View>

          {/* Spending Limit */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spending Limit</Text>
            <Text style={styles.sectionDescription}>
              Set the maximum amount that can be spent with this card
            </Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={spendingLimit}
                onChangeText={handleSpendingLimitChange}
                placeholder="100"
                keyboardType="numeric"
                maxLength={6}
              />
              <Text style={styles.inputSuffix}>.00</Text>
            </View>
            
            <Text style={styles.helperText}>
              Preview: {formatUSD(parseInt(spendingLimit || '0'))}
            </Text>
            <Text style={styles.limitText}>
              Minimum: $1.00 • Maximum: $5,000.00
            </Text>
          </View>

          {/* Expiration Settings */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.sectionTitle}>Custom Expiration</Text>
                <Text style={styles.sectionDescription}>
                  Set a custom expiration date (default: 12 months)
                </Text>
              </View>
              <Switch
                value={useCustomExpiration}
                onValueChange={setUseCustomExpiration}
                trackColor={{ false: '#E5E7EB', true: '#93C5FD' }}
                thumbColor={useCustomExpiration ? '#3B82F6' : '#9CA3AF'}
              />
            </View>

            {useCustomExpiration && (
              <View style={styles.expirationContainer}>
                <Text style={styles.inputLabel}>Months until expiration</Text>
                <TextInput
                  style={styles.textInput}
                  value={expirationMonths}
                  onChangeText={setExpirationMonths}
                  placeholder="12"
                  keyboardType="numeric"
                  maxLength={2}
                />
                <Text style={styles.helperText}>
                  Card will expire in {expirationMonths || '0'} month(s)
                </Text>
              </View>
            )}
          </View>

          {/* Restriction Templates */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Security Templates</Text>
            <Text style={styles.sectionDescription}>
              Quick setup with pre-configured security restrictions
            </Text>
            
            <View style={styles.templateGrid}>
              {restrictionTemplates.map((template) => (
                <TouchableOpacity
                  key={template.name}
                  style={[
                    styles.templateButton,
                    selectedTemplate === template.name && styles.templateButtonActive,
                  ]}
                  onPress={() => setSelectedTemplate(
                    selectedTemplate === template.name ? '' : template.name
                  )}
                >
                  <Text
                    style={[
                      styles.templateButtonTitle,
                      selectedTemplate === template.name && styles.templateButtonTitleActive,
                    ]}
                  >
                    {template.name}
                  </Text>
                  <Text
                    style={[
                      styles.templateButtonDescription,
                      selectedTemplate === template.name && styles.templateButtonDescriptionActive,
                    ]}
                  >
                    {template.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Geographic Restrictions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Geographic Restrictions</Text>
            <Text style={styles.sectionDescription}>
              Limit card usage to specific countries (optional)
            </Text>

            <View style={styles.merchantGrid}>
              {commonCountries.map((country) => (
                <TouchableOpacity
                  key={country.code}
                  style={[
                    styles.merchantButton,
                    geographicRestrictions.includes(country.code) && styles.merchantButtonActive,
                  ]}
                  onPress={() => {
                    if (geographicRestrictions.includes(country.code)) {
                      setGeographicRestrictions(geographicRestrictions.filter(c => c !== country.code));
                    } else {
                      setGeographicRestrictions([...geographicRestrictions, country.code]);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.merchantButtonText,
                      geographicRestrictions.includes(country.code) && styles.merchantButtonTextActive,
                    ]}
                  >
                    {country.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Merchant Category Restrictions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Merchant Category Blocks</Text>
            <Text style={styles.sectionDescription}>
              Block specific types of merchants (optional)
            </Text>

            {/* Predefined Categories with risk indicators */}
            <View style={styles.merchantGrid}>
              {merchantCategories.map((category) => (
                <TouchableOpacity
                  key={category.code}
                  style={[
                    styles.merchantButton,
                    merchantRestrictions.includes(category.code) && styles.merchantButtonActive,
                    category.riskLevel === 'high' && styles.highRiskButton,
                  ]}
                  onPress={() => toggleMerchantRestriction(category.code)}
                >
                  <View style={styles.merchantButtonContent}>
                    <Text
                      style={[
                        styles.merchantButtonText,
                        merchantRestrictions.includes(category.code) && styles.merchantButtonTextActive,
                      ]}
                    >
                      {category.name}
                    </Text>
                    {category.riskLevel === 'high' && (
                      <Text style={styles.riskIndicator}>⚠️</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Merchant Code */}
            <View style={styles.customMerchantContainer}>
              <Text style={styles.inputLabel}>Custom Merchant Code</Text>
              <View style={styles.customMerchantRow}>
                <TextInput
                  style={[styles.textInput, styles.customMerchantInput]}
                  value={customMerchant}
                  onChangeText={setCustomMerchant}
                  placeholder="e.g., 5999"
                  maxLength={10}
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={addCustomMerchant}
                  disabled={!customMerchant.trim()}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Selected Restrictions */}
            {merchantRestrictions.length > 0 && (
              <View style={styles.selectedRestrictions}>
                <Text style={styles.selectedRestrictionsTitle}>Selected Restrictions:</Text>
                <View style={styles.restrictionTags}>
                  {merchantRestrictions.map((code) => {
                    const category = merchantCategories.find(c => c.code === code);
                    return (
                      <TouchableOpacity
                        key={code}
                        style={styles.restrictionTag}
                        onPress={() => removeMerchantRestriction(code)}
                      >
                        <Text style={styles.restrictionTagText}>
                          {category ? category.name : code}
                        </Text>
                        <Text style={styles.restrictionTagRemove}>×</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* Card Activation */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.sectionTitle}>Activate Immediately</Text>
                <Text style={styles.sectionDescription}>
                  Enable the card for transactions right after creation
                </Text>
              </View>
              <Switch
                value={activateImmediately}
                onValueChange={setActivateImmediately}
                trackColor={{ false: '#E5E7EB', true: '#93C5FD' }}
                thumbColor={activateImmediately ? '#3B82F6' : '#9CA3AF'}
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {onCancel && (
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onCancel}
                disabled={isCreating}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.button, styles.createButton]}
              onPress={handleCreateCard}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.createButtonText}>Create Card</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Privacy Notice */}
          <View style={styles.privacyNotice}>
            <Text style={styles.privacyNoticeText}>
              🔒 Your card will be provisioned through the Visa network via Marqeta with cryptographic isolation and privacy protection.
              Card details will be temporarily visible after creation for secure copying.
              {selectedTemplate && ` Security template "${selectedTemplate}" will be applied.`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  scrollView: {
    flex: 1,
  },

  content: {
    padding: 16,
  },

  // Header
  header: {
    marginBottom: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },

  // Section
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },

  // Switch row
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  switchLabel: {
    flex: 1,
    marginRight: 16,
  },

  // Input styles
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    marginBottom: 8,
  },

  currencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: 4,
  },

  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    paddingVertical: 12,
    textAlign: 'right',
  },

  inputSuffix: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 4,
  },

  textInput: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: 'white',
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },

  helperText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },

  limitText: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Expiration
  expirationContainer: {
    marginTop: 16,
  },

  // Merchant restrictions
  merchantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },

  merchantButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
  },

  merchantButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },

  merchantButtonText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },

  merchantButtonTextActive: {
    color: 'white',
  },

  // Custom merchant
  customMerchantContainer: {
    marginBottom: 16,
  },

  customMerchantRow: {
    flexDirection: 'row',
    gap: 8,
  },

  customMerchantInput: {
    flex: 1,
  },

  addButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },

  addButtonText: {
    color: 'white',
    fontWeight: '600',
  },

  // Selected restrictions
  selectedRestrictions: {
    marginTop: 8,
  },

  selectedRestrictionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },

  restrictionTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  restrictionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },

  restrictionTagText: {
    fontSize: 12,
    color: '#92400E',
    marginRight: 4,
  },

  restrictionTagRemove: {
    fontSize: 14,
    color: '#92400E',
    fontWeight: 'bold',
  },

  // Templates
  templateGrid: {
    gap: 12,
  },

  templateButton: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
  },

  templateButtonActive: {
    backgroundColor: '#EBF8FF',
    borderColor: '#3B82F6',
  },

  templateButtonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },

  templateButtonTitleActive: {
    color: '#1E40AF',
  },

  templateButtonDescription: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },

  templateButtonDescriptionActive: {
    color: '#3B82F6',
  },

  // Enhanced merchant buttons
  merchantButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  highRiskButton: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },

  riskIndicator: {
    fontSize: 10,
    marginLeft: 4,
  },

  // Action buttons
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },

  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },

  cancelButton: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },

  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },

  createButton: {
    backgroundColor: '#3B82F6',
  },

  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },

  // Privacy notice
  privacyNotice: {
    backgroundColor: '#F0F9FF',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },

  privacyNoticeText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
  },
});

export default CardCreationScreen;