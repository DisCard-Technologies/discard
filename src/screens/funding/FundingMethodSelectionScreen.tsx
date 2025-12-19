
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface FundingMethodSelectionScreenProps {
  onSelectCrypto: () => void;
  onSelectStripe: () => void;
  onCancel: () => void;
}

const FundingMethodSelectionScreen: React.FC<FundingMethodSelectionScreenProps> = ({
  onSelectCrypto,
  onSelectStripe,
  onCancel,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Choose a Funding Method</Text>
        <Text style={styles.subtitle}>
          How would you like to add money to your account?
        </Text>

        <View style={styles.options}>
          <TouchableOpacity
            style={[styles.optionButton, styles.primaryOption]}
            onPress={onSelectCrypto}
          >
            <Text style={styles.optionIcon}>🪙</Text>
            <Text style={styles.optionText}>Crypto Wallet</Text>
            <Text style={styles.optionSubtext}>
              Convert crypto to a spendable USD balance.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionButton} onPress={onSelectStripe}>
            <Text style={styles.optionIcon}>🏦</Text>
            <Text style={styles.optionText}>Bank or Card</Text>
            <Text style={styles.optionSubtext}>
              Fund using a linked Stripe payment method.
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: 'white',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  options: {
    gap: 16,
  },
  optionButton: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryOption: {
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  optionIcon: {
    fontSize: 28,
    marginBottom: 12,
  },
  optionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  optionSubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
});

export default FundingMethodSelectionScreen;
