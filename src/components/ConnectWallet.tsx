import React, { useState } from 'react';
import { Button, Text, View, StyleSheet, Alert } from 'react-native';

export default function ConnectWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      // Simulate wallet connection for development
      Alert.alert(
        'Development Mode',
        'This is a simulated wallet connection for testing purposes.',
        [
          {
            text: 'Connect',
            onPress: () => {
              setIsConnected(true);
              setWalletAddress('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'); // Example address
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } catch (err) {
      console.error('Failed to connect to wallet', err);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setWalletAddress(null);
  };

  return (
    <View style={styles.container}>
      {isConnected && walletAddress ? (
        <>
          <Text style={styles.text}>Connected (Dev Mode):</Text>
          <Text style={styles.text}>{walletAddress}</Text>
          <Button title="Disconnect" onPress={handleDisconnect} />
        </>
      ) : (
        <Button title="Connect Solana Wallet (Dev)" onPress={handleConnect} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    marginBottom: 10,
  },
});