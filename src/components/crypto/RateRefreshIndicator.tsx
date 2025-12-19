/**
 * RateRefreshIndicator Component for React Native
 * Visual indicator for real-time rate updates with manual refresh controls
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  Animated,
  Easing,
} from 'react-native';

interface RateRefreshIndicatorProps {
  isLoading?: boolean;
  lastUpdated?: Date;
  autoRefreshEnabled?: boolean;
  refreshInterval?: number; // seconds
  onRefresh?: () => void;
  onToggleAutoRefresh?: (enabled: boolean) => void;
  style?: ViewStyle;
}

const RateRefreshIndicator: React.FC<RateRefreshIndicatorProps> = ({
  isLoading = false,
  lastUpdated,
  autoRefreshEnabled = true,
  refreshInterval = 30,
  onRefresh,
  onToggleAutoRefresh,
  style,
}) => {
  const [timeUntilRefresh, setTimeUntilRefresh] = useState(refreshInterval);
  const [timeSinceUpdate, setTimeSinceUpdate] = useState<string>('');
  
  // Animation values
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const rotateAnimation = useRef(new Animated.Value(0)).current;
  const progressAnimation = useRef(new Animated.Value(0)).current;

  // Update countdown timer
  useEffect(() => {
    if (!autoRefreshEnabled || isLoading) return;

    const interval = setInterval(() => {
      setTimeUntilRefresh((prev) => {
        if (prev <= 1) {
          // Reset to full interval when reaching 0
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, isLoading, refreshInterval]);

  // Update "time since update" display
  useEffect(() => {
    if (!lastUpdated) return;

    const updateTimeSince = () => {
      const now = new Date();
      const diffMs = now.getTime() - lastUpdated.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);

      if (diffSeconds < 60) {
        setTimeSinceUpdate(`${diffSeconds}s ago`);
      } else if (diffMinutes < 60) {
        setTimeSinceUpdate(`${diffMinutes}m ago`);
      } else {
        setTimeSinceUpdate(`${Math.floor(diffMinutes / 60)}h ago`);
      }
    };

    updateTimeSince();
    const interval = setInterval(updateTimeSince, 1000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Pulse animation for loading state
  useEffect(() => {
    if (isLoading) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 0.6,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnimation.setValue(1);
    }
  }, [isLoading, pulseAnimation]);

  // Rotation animation for manual refresh
  const triggerRotation = () => {
    rotateAnimation.setValue(0);
    Animated.timing(rotateAnimation, {
      toValue: 1,
      duration: 600,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  };

  // Progress animation for countdown
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const progress = 1 - (timeUntilRefresh / refreshInterval);
    Animated.timing(progressAnimation, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [timeUntilRefresh, refreshInterval, autoRefreshEnabled, progressAnimation]);

  const handleRefresh = () => {
    if (isLoading) return;
    triggerRotation();
    onRefresh?.();
    setTimeUntilRefresh(refreshInterval); // Reset countdown
  };

  const handleToggleAutoRefresh = () => {
    const newValue = !autoRefreshEnabled;
    onToggleAutoRefresh?.(newValue);
    if (newValue) {
      setTimeUntilRefresh(refreshInterval);
    }
  };

  const getStatusColor = () => {
    if (isLoading) return '#3B82F6';
    if (!autoRefreshEnabled) return '#6B7280';
    if (timeUntilRefresh <= 5) return '#F59E0B';
    return '#10B981';
  };

  const getStatusText = () => {
    if (isLoading) return 'Updating...';
    if (!autoRefreshEnabled) return 'Auto-refresh off';
    if (timeUntilRefresh <= 5) return 'Refreshing soon';
    return 'Live rates';
  };

  const formatTimeUntilRefresh = () => {
    if (!autoRefreshEnabled || isLoading) return '';
    if (timeUntilRefresh <= 5) return `${timeUntilRefresh}s`;
    return `${Math.floor(timeUntilRefresh / 60)}:${String(timeUntilRefresh % 60).padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, style]}>
      {/* Status Indicator */}
      <View style={styles.statusSection}>
        <Animated.View
          style={[
            styles.statusDot,
            {
              backgroundColor: getStatusColor(),
              opacity: pulseAnimation,
            },
          ]}
        />
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>
      </View>

      {/* Time Information */}
      <View style={styles.timeSection}>
        {lastUpdated && (
          <Text style={styles.lastUpdatedText}>
            Updated {timeSinceUpdate}
          </Text>
        )}
        {autoRefreshEnabled && !isLoading && (
          <Text style={styles.nextRefreshText}>
            Next: {formatTimeUntilRefresh()}
          </Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controlsSection}>
        {/* Auto-refresh toggle */}
        <TouchableOpacity
          style={[
            styles.autoRefreshToggle,
            autoRefreshEnabled && styles.autoRefreshToggleActive,
          ]}
          onPress={handleToggleAutoRefresh}
        >
          <Text style={[
            styles.autoRefreshText,
            autoRefreshEnabled && styles.autoRefreshTextActive,
          ]}>
            Auto
          </Text>
        </TouchableOpacity>

        {/* Manual refresh button */}
        <TouchableOpacity
          style={[styles.refreshButton, isLoading && styles.refreshButtonDisabled]}
          onPress={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Animated.View
              style={{
                transform: [{
                  rotate: rotateAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                }],
              }}
            >
              <Text style={styles.refreshIcon}>↻</Text>
            </Animated.View>
          )}
        </TouchableOpacity>
      </View>

      {/* Progress Bar (for auto-refresh countdown) */}
      {autoRefreshEnabled && !isLoading && (
        <View style={styles.progressBarContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: getStatusColor(),
              },
            ]}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },

  // Status Section
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Time Section
  timeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  lastUpdatedText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },

  nextRefreshText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '600',
    fontFamily: 'monospace',
  },

  // Controls Section
  controlsSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  autoRefreshToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },

  autoRefreshToggleActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },

  autoRefreshText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
  },

  autoRefreshTextActive: {
    color: '#3B82F6',
  },

  refreshButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  refreshButtonDisabled: {
    opacity: 0.6,
  },

  refreshIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
  },

  // Progress Bar
  progressBarContainer: {
    height: 2,
    backgroundColor: '#F3F4F6',
    borderRadius: 1,
    overflow: 'hidden',
  },

  progressBar: {
    height: '100%',
    borderRadius: 1,
  },
});

export default RateRefreshIndicator;