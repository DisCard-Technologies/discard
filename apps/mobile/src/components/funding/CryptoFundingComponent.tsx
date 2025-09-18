
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFunding } from '../../stores/funding';

// TODO: Replace with actual API call to get supported assets
const SUPPORTED_CRYPTO = ['ETH', 'BTC', 'USDC'];

interface CryptoFundingComponentProps {
  onSuccess: (transactionId: string) => void;
  onCancel: () => void;
}

type FundingStep = 'input' | 'confirm' | 'deposit';

const CryptoFundingComponent: React.FC<CryptoFundingComponentProps> = ({
  onSuccess,
  onCancel,
}) => {
  const { actions } = useFunding();
  const [step, setStep] = useState<FundingStep>('input');

  // Form state
  const [amount, setAmount] = useState('');
  const [selectedCrypto, setSelectedCrypto] = useState(SUPPORTED_CRYPTO[0]);

  // Quote state
  const [quote, setQuote] = useState<{ id: string; usdAmount: number } | null>(
    null
  );
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);

  // Deposit state
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleGetQuote = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to convert.');
      return;
    }

    setIsQuoting(true);
    setQuoteError(null);
    try {
      // const fetchedQuote = await actions.getQuote(selectedCrypto, parsedAmount);
      // MOCK IMPLEMENTATION
      const fetchedQuote = {
        id: 'quote_123',
        usdAmount: parsedAmount * (selectedCrypto === 'ETH' ? 3500 : 50000),
      };
      setQuote(fetchedQuote);
      setStep('confirm');
    } catch (error) {
      setQuoteError('Failed to get quote. Please try again.');
      console.error(error);
    } finally {
      setIsQuoting(false);
    }
  };

  const handleExecuteTrade = async () => {
    if (!quote) return;

    setIsExecuting(true);
    try {
      // const result = await actions.executeTrade(quote.id);
      // MOCK IMPLEMENTATION
      const result = {
        transactionId: 'txn_abc',
        depositAddress: `0x1234...${Math.floor(Math.random() * 9000) + 1000}`,
      };
      setDepositAddress(result.depositAddress);
      setStep('deposit');
    } catch (error) {
      Alert.alert('Error', 'Could not execute trade. Please try again.');
      console.error(error);
      setStep('input');
    } finally {
      setIsExecuting(false);
    }
  };

  const renderInputStep = () => (
    <View>
      <Text style={styles.label}>Select Cryptocurrency</Text>
      <View style={styles.cryptoSelector}>
        {SUPPORTED_CRYPTO.map((crypto) => (
          <TouchableOpacity
            key={crypto}
            style={[
              styles.cryptoButton,
              selectedCrypto === crypto && styles.selectedCryptoButton,
            ]}
            onPress={() => setSelectedCrypto(crypto)}
          >
            <Text style={styles.cryptoButtonText}>{crypto}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Amount to Convert</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder={`0.00 ${selectedCrypto}`}
        keyboardType="decimal-pad"
      />

      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleGetQuote}
        disabled={isQuoting}
      >
        {isQuoting ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitButtonText}>Get Quote</Text>
        )}
      </TouchableOpacity>
      {quoteError && <Text style={styles.errorText}>{quoteError}</Text>}
    </View>
  );

  const renderConfirmStep = () => (
    <View style={styles.confirmationContainer}>
      <Text style={styles.label}>You are converting:</Text>
      <Text style={styles.quoteText}>
        {amount} {selectedCrypto} ≈ ${quote?.usdAmount.toFixed(2)} USD
      </Text>
      <Text style={styles.quoteDisclaimer}>Quote is valid for 60 seconds.</Text>

      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleExecuteTrade}
        disabled={isExecuting}
      >
        {isExecuting ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitButtonText}>Confirm & Get Deposit Address</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => setStep('input')}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const renderDepositStep = () => (
    <View style={styles.depositContainer}>
      <Text style={styles.depositTitle}>Deposit Required</Text>
      <Text style={styles.depositInstructions}>
        To complete the conversion, send exactly {amount} {selectedCrypto} to the
        address below. Your USD balance will be credited upon network
        confirmation.
      </Text>
      <Text style={styles.label}>Deposit Address:</Text>
      <Text selectable style={styles.depositAddress}>
        {depositAddress}
      </Text>
      {/* TODO: Add QR Code component */}
      <TouchableOpacity
        style={styles.submitButton}
        onPress={() => onSuccess(depositAddress || 'unknown')}
      >
        <Text style={styles.submitButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {step === 'input' && renderInputStep()}
      {step === 'confirm' && renderConfirmStep()}
      {step === 'deposit' && renderDepositStep()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { /* ... styles ... */ },
  cryptoSelector: { flexDirection: 'row', marginBottom: 16 },
  cryptoButton: { /* ... styles ... */ },
  selectedCryptoButton: { /* ... styles ... */ },
  cryptoButtonText: { /* ... styles ... */ },
  submitButton: { /* ... styles ... */ },
  submitButtonText: { /* ... styles ... */ },
  cancelButton: { /* ... styles ... */ },
  cancelButtonText: { /* ... styles ... */ },
  errorText: { color: 'red', marginTop: 8 },
  confirmationContainer: { alignItems: 'center' },
  quoteText: { fontSize: 24, fontWeight: '700', marginVertical: 16 },
  quoteDisclaimer: { fontSize: 12, color: 'gray', marginBottom: 24 },
  depositContainer: { alignItems: 'center' },
  depositTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  depositInstructions: { textAlign: 'center', marginBottom: 16 },
  depositAddress: { fontFamily: 'monospace', fontSize: 16, padding: 16, backgroundColor: '#EEE', borderRadius: 8, marginVertical: 8 },
});

export default CryptoFundingComponent;
