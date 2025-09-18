import { useWallet } from '@solana-mobile/wallet-adapter-mobile';
import React from 'react';
import { Button, Text, View, StyleSheet } from 'react-native';

export default function ConnectWallet() {
  const { publicKey, connect, disconnect } = useWallet();

  const handleConnect = async () => {
    try {
      await connect();
    } catch (err) {
      console.error('Failed to connect to wallet', err);
    }
  };

  return (
    <View style={styles.container}>
      {publicKey ? (
        <>
          <Text style={styles.text}>Connected:</Text>
          <Text style={styles.text}>{publicKey.toBase58()}</Text>
          <Button title="Disconnect" onPress={disconnect} />
        </>
      ) : (
        <Button title="Connect Solana Wallet" onPress={handleConnect} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    marginBottom: 10,
  },
});
