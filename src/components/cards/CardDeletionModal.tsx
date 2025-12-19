/**
 * Card Deletion Modal for React Native
 * Multi-step confirmation modal with comprehensive warnings and impact summary
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatUSD } from '../../types';
import { CardWithDetails } from '../../stores/cards';

interface DeletionImpactSummary {
  affectedTransactions: number;
  currentBalance: number;
  dependentServices: string[];
  lastUsed: string | null;
  createdAt: string;
}

interface DeletionProgress {
  step: 'confirmation' | 'impact' | 'typing' | 'final' | 'processing' | 'complete' | 'error';
  message: string;
  canGoBack: boolean;
  canProceed: boolean;
}

export interface CardDeletionModalProps {
  visible: boolean;
  card: CardWithDetails | null;
  onClose: () => void;
  onDelete: (cardId: string, confirmationPhrase: string, coolingOffPeriod?: boolean) => Promise<void>;
  impactSummary?: DeletionImpactSummary;
}

const REQUIRED_CONFIRMATION_PHRASE = 'DELETE PERMANENTLY';
const COOLING_OFF_PERIOD_HOURS = 24;

const CardDeletionModal: React.FC<CardDeletionModalProps> = ({
  visible,
  card,
  onClose,
  onDelete,
  impactSummary,
}) => {
  const [progress, setProgress] = useState<DeletionProgress>({
    step: 'confirmation',
    message: 'Review deletion details',
    canGoBack: true,
    canProceed: true,
  });
  
  const [typedPhrase, setTypedPhrase] = useState('');
  const [enableCoolingOff, setEnableCoolingOff] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionResult, setDeletionResult] = useState<{
    success: boolean;
    deletionId?: string;
    deletionProof?: string;
    error?: string;
  } | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setProgress({
        step: 'confirmation',
        message: 'Review deletion details',
        canGoBack: true,
        canProceed: true,
      });
      setTypedPhrase('');
      setEnableCoolingOff(false);
      setIsDeleting(false);
      setDeletionResult(null);
    }
  }, [visible]);

  const handleNext = () => {
    switch (progress.step) {
      case 'confirmation':
        setProgress({
          step: 'impact',
          message: 'Review deletion impact',
          canGoBack: true,
          canProceed: true,
        });
        break;
      case 'impact':
        setProgress({
          step: 'typing',
          message: 'Type confirmation phrase',
          canGoBack: true,
          canProceed: false,
        });
        break;
      case 'typing':
        if (typedPhrase === REQUIRED_CONFIRMATION_PHRASE) {
          setProgress({
            step: 'final',
            message: 'Final confirmation',
            canGoBack: true,
            canProceed: true,
          });
        }
        break;
      case 'final':
        handleDelete();
        break;
      default:
        break;
    }
  };

  const handleBack = () => {
    switch (progress.step) {
      case 'impact':
        setProgress({
          step: 'confirmation',
          message: 'Review deletion details',
          canGoBack: true,
          canProceed: true,
        });
        break;
      case 'typing':
        setProgress({
          step: 'impact',
          message: 'Review deletion impact',
          canGoBack: true,
          canProceed: true,
        });
        break;
      case 'final':
        setProgress({
          step: 'typing',
          message: 'Type confirmation phrase',
          canGoBack: true,
          canProceed: typedPhrase === REQUIRED_CONFIRMATION_PHRASE,
        });
        break;
      default:
        break;
    }
  };

  const handleDelete = async () => {
    if (!card) return;

    setIsDeleting(true);
    setProgress({
      step: 'processing',
      message: 'Deleting card permanently...',
      canGoBack: false,
      canProceed: false,
    });

    try {
      await onDelete(card.cardId, typedPhrase, enableCoolingOff);
      
      setDeletionResult({
        success: true,
        deletionId: `del-${Date.now()}`, // Would come from API
        deletionProof: `proof-${Date.now()}`, // Would come from API
      });
      
      setProgress({
        step: 'complete',
        message: 'Card deleted successfully',
        canGoBack: false,
        canProceed: false,
      });
    } catch (error) {
      setDeletionResult({
        success: false,
        error: error instanceof Error ? error.message : 'Deletion failed',
      });
      
      setProgress({
        step: 'error',
        message: 'Deletion failed',
        canGoBack: true,
        canProceed: false,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTypingChange = (text: string) => {
    setTypedPhrase(text.toUpperCase());
    setProgress(prev => ({
      ...prev,
      canProceed: text.toUpperCase() === REQUIRED_CONFIRMATION_PHRASE,
    }));
  };

  const renderStepContent = () => {
    if (!card) return null;

    switch (progress.step) {
      case 'confirmation':
        return (
          <View style={styles.stepContent}>
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>⚠️ Irreversible Action</Text>
              <Text style={styles.warningText}>
                This action will permanently delete your card and all associated data. 
                This cannot be undone.
              </Text>
            </View>

            <View style={styles.cardInfo}>
              <Text style={styles.sectionTitle}>Card to Delete</Text>
              <View style={styles.cardSummary}>
                <Text style={styles.cardNumber}>•••• •••• •••• {card.lastFour || '0000'}</Text>
                <Text style={styles.cardStatus}>Status: {card.status}</Text>
                <Text style={styles.cardBalance}>Balance: {formatUSD(card.currentBalance || 0)}</Text>
              </View>
            </View>

            <View style={styles.deletionInfo}>
              <Text style={styles.sectionTitle}>What will be deleted:</Text>
              <Text style={styles.listItem}>• Card number and security details</Text>
              <Text style={styles.listItem}>• All transaction history</Text>
              <Text style={styles.listItem}>• Merchant restrictions and settings</Text>
              <Text style={styles.listItem}>• Funding allocations</Text>
              <Text style={styles.listItem}>• Network registration with Visa</Text>
            </View>
          </View>
        );

      case 'impact':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.sectionTitle}>Deletion Impact Summary</Text>
            
            <View style={styles.impactGrid}>
              <View style={styles.impactItem}>
                <Text style={styles.impactNumber}>
                  {impactSummary?.affectedTransactions || 0}
                </Text>
                <Text style={styles.impactLabel}>Transactions</Text>
              </View>
              
              <View style={styles.impactItem}>
                <Text style={styles.impactNumber}>
                  {formatUSD(impactSummary?.currentBalance || 0)}
                </Text>
                <Text style={styles.impactLabel}>Current Balance</Text>
              </View>
            </View>

            {impactSummary?.dependentServices && impactSummary.dependentServices.length > 0 && (
              <View style={styles.servicesInfo}>
                <Text style={styles.sectionTitle}>Affected Services:</Text>
                {impactSummary.dependentServices.map((service, index) => (
                  <Text key={index} style={styles.listItem}>• {service}</Text>
                ))}
              </View>
            )}

            <View style={styles.timeInfo}>
              <Text style={styles.sectionTitle}>Timeline:</Text>
              <Text style={styles.listItem}>• Immediate: Card becomes unusable (≤30s)</Text>
              <Text style={styles.listItem}>• Within 2 minutes: Network cancellation</Text>
              <Text style={styles.listItem}>• Within 5 minutes: Cryptographic deletion complete</Text>
              <Text style={styles.listItem}>• 7 days: KMS key deletion (compliance)</Text>
            </View>

            <View style={styles.coolingOffOption}>
              <View style={styles.switchRow}>
                <Switch
                  value={enableCoolingOff}
                  onValueChange={setEnableCoolingOff}
                  trackColor={{ false: '#ccc', true: '#007AFF' }}
                />
                <Text style={styles.switchLabel}>
                  Enable 24-hour cooling-off period
                </Text>
              </View>
              {enableCoolingOff && (
                <Text style={styles.coolingOffInfo}>
                  Deletion will be scheduled for {COOLING_OFF_PERIOD_HOURS} hours from now. 
                  You can cancel anytime before then.
                </Text>
              )}
            </View>
          </View>
        );

      case 'typing':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.sectionTitle}>Confirmation Required</Text>
            <Text style={styles.instructionText}>
              To proceed with permanent deletion, type the following phrase exactly:
            </Text>
            
            <View style={styles.phraseBox}>
              <Text style={styles.phraseText}>{REQUIRED_CONFIRMATION_PHRASE}</Text>
            </View>

            <TextInput
              style={[
                styles.confirmationInput,
                typedPhrase === REQUIRED_CONFIRMATION_PHRASE && styles.confirmationInputValid
              ]}
              value={typedPhrase}
              onChangeText={handleTypingChange}
              placeholder="Type confirmation phrase here"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus={true}
            />

            {typedPhrase.length > 0 && typedPhrase !== REQUIRED_CONFIRMATION_PHRASE && (
              <Text style={styles.validationError}>
                Phrase must match exactly
              </Text>
            )}
          </View>
        );

      case 'final':
        return (
          <View style={styles.stepContent}>
            <View style={styles.finalWarning}>
              <Text style={styles.finalWarningTitle}>🚨 Final Warning</Text>
              <Text style={styles.finalWarningText}>
                You are about to permanently delete this card. This action cannot be reversed.
              </Text>
            </View>

            <View style={styles.finalSummary}>
              <Text style={styles.finalSummaryTitle}>Final Confirmation:</Text>
              <Text style={styles.listItem}>✓ Card: •••• •••• •••• {card.lastFour || '0000'}</Text>
              <Text style={styles.listItem}>✓ Confirmation phrase entered correctly</Text>
              <Text style={styles.listItem}>
                ✓ Cooling-off period: {enableCoolingOff ? 'Enabled (24h)' : 'Disabled'}
              </Text>
            </View>

            <Text style={styles.proceedWarning}>
              Click "Delete Permanently" to proceed with irreversible deletion.
            </Text>
          </View>
        );

      case 'processing':
        return (
          <View style={styles.stepContent}>
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.processingTitle}>Deleting Card...</Text>
              <Text style={styles.processingSteps}>
                • Deactivating card network access...{'\n'}
                • Scheduling cryptographic deletion...{'\n'}
                • Generating deletion proof...{'\n'}
                • Recording compliance audit...
              </Text>
            </View>
          </View>
        );

      case 'complete':
        return (
          <View style={styles.stepContent}>
            <View style={styles.successContainer}>
              <Text style={styles.successIcon}>✅</Text>
              <Text style={styles.successTitle}>Card Deleted Successfully</Text>
              <Text style={styles.successMessage}>
                Your card has been permanently deleted and is no longer usable.
              </Text>

              {deletionResult && (
                <View style={styles.deletionDetails}>
                  <Text style={styles.sectionTitle}>Deletion Details:</Text>
                  <Text style={styles.listItem}>
                    Deletion ID: {deletionResult.deletionId}
                  </Text>
                  <Text style={styles.listItem}>
                    Proof Hash: {deletionResult.deletionProof?.substring(0, 16)}...
                  </Text>
                  <Text style={styles.listItem}>
                    Deleted: {new Date().toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );

      case 'error':
        return (
          <View style={styles.stepContent}>
            <View style={styles.errorContainer}>
              <Text style={styles.errorIcon}>❌</Text>
              <Text style={styles.errorTitle}>Deletion Failed</Text>
              <Text style={styles.errorMessage}>
                {deletionResult?.error || 'An unexpected error occurred during deletion.'}
              </Text>
              <Text style={styles.errorInstructions}>
                Please try again or contact support if the problem persists.
              </Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const renderFooter = () => {
    if (progress.step === 'processing') {
      return null; // No buttons during processing
    }

    if (progress.step === 'complete') {
      return (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
            <Text style={styles.primaryButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (progress.step === 'error') {
      return (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.primaryButton} 
            onPress={() => {
              setProgress({
                step: 'final',
                message: 'Final confirmation',
                canGoBack: true,
                canProceed: true,
              });
            }}
          >
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.footer}>
        {progress.canGoBack && progress.step !== 'confirmation' && (
          <TouchableOpacity style={styles.secondaryButton} onPress={handleBack}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        
        {progress.step === 'final' ? (
          <TouchableOpacity 
            style={[styles.deleteButton, isDeleting && styles.buttonDisabled]} 
            onPress={handleNext}
            disabled={!progress.canProceed || isDeleting}
          >
            <Text style={styles.deleteButtonText}>Delete Permanently</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.primaryButton, !progress.canProceed && styles.buttonDisabled]} 
            onPress={handleNext}
            disabled={!progress.canProceed}
          >
            <Text style={styles.primaryButtonText}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Delete Card</Text>
          <Text style={styles.subtitle}>Step {
            ['confirmation', 'impact', 'typing', 'final'].indexOf(progress.step) + 1
          } of 4</Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {renderStepContent()}
        </ScrollView>

        {renderFooter()}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  stepContent: {
    padding: 20,
  },
  warningBox: {
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffeaa7',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  cardInfo: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  cardSummary: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
  },
  cardNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cardStatus: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  cardBalance: {
    fontSize: 14,
    color: '#666',
  },
  deletionInfo: {
    marginBottom: 20,
  },
  listItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
    lineHeight: 20,
  },
  impactGrid: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  impactItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 8,
  },
  impactNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  impactLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  servicesInfo: {
    marginBottom: 20,
  },
  timeInfo: {
    marginBottom: 20,
  },
  coolingOffOption: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  coolingOffInfo: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  phraseBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  phraseText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'monospace',
  },
  confirmationInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  confirmationInputValid: {
    borderColor: '#28a745',
    backgroundColor: '#f8fff9',
  },
  validationError: {
    fontSize: 12,
    color: '#dc3545',
    marginTop: 8,
    textAlign: 'center',
  },
  finalWarning: {
    backgroundColor: '#f8d7da',
    borderWidth: 1,
    borderColor: '#f5c6cb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  finalWarningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#721c24',
    marginBottom: 8,
  },
  finalWarningText: {
    fontSize: 14,
    color: '#721c24',
    lineHeight: 20,
  },
  finalSummary: {
    marginBottom: 20,
  },
  finalSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  proceedWarning: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  processingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 24,
  },
  processingSteps: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  successIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  deletionDetails: {
    alignSelf: 'stretch',
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorInstructions: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#dc3545',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default CardDeletionModal;