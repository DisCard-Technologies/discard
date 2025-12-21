import React from 'react';
import { View, StyleSheet } from 'react-native';

interface AmbientBackgroundProps {
  children: React.ReactNode;
}

export function AmbientBackground({ children }: AmbientBackgroundProps) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0A0A' }]}>
      {/* Subtle top glow - matching the design */}
      <View 
        style={{
          position: 'absolute',
          top: -100,
          left: '50%',
          width: 500,
          height: 400,
          marginLeft: -250,
          borderRadius: 200,
          backgroundColor: 'rgba(16, 185, 129, 0.06)',
        }}
      />
      
      {/* Content */}
      <View style={{ flex: 1 }}>
        {children}
      </View>
    </View>
  );
}

