import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface IsolationStatus {
  isolated: boolean;
  lastVerified: string;
  riskLevel: 'low' | 'medium' | 'high';
  violationCount: number;
}

interface IsolationStatusIndicatorProps {
  cardId: string;
  onStatusChange?: (status: IsolationStatus) => void;
}

export const IsolationStatusIndicator: React.FC<IsolationStatusIndicatorProps> = ({
  cardId,
  onStatusChange
}) => {
  const [status, setStatus] = useState<IsolationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkIsolationStatus();
    const interval = setInterval(checkIsolationStatus, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [cardId]);

  const checkIsolationStatus = async () => {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/v1/privacy/isolation/verify/${cardId}`, {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
          'X-Card-Context': cardId
        }
      });

      if (!response.ok) {
        throw new Error('Failed to verify isolation');
      }

      const data = await response.json();
      setStatus(data);
      setError(null);
      onStatusChange?.(data);
    } catch (err) {
      setError('Unable to verify privacy status');
      console.error('Isolation verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getAuthToken = async (): Promise<string> => {
    // This would retrieve the actual auth token from secure storage
    return 'mock-auth-token';
  };

  const getStatusColor = () => {
    if (!status?.isolated) return '#FF3B30'; // Red
    switch (status.riskLevel) {
      case 'low':
        return '#34C759'; // Green
      case 'medium':
        return '#FF9500'; // Orange
      case 'high':
        return '#FF3B30'; // Red
      default:
        return '#8E8E93'; // Gray
    }
  };

  const getStatusIcon = () => {
    if (!status?.isolated) return 'error';
    switch (status.riskLevel) {
      case 'low':
        return 'shield';
      case 'medium':
        return 'warning';
      case 'high':
        return 'error';
      default:
        return 'help';
    }
  };

  const getStatusText = () => {
    if (!status?.isolated) return 'Privacy Not Verified';
    switch (status.riskLevel) {
      case 'low':
        return 'Privacy Protected';
      case 'medium':
        return 'Privacy Warning';
      case 'high':
        return 'Privacy Risk Detected';
      default:
        return 'Unknown Status';
    }
  };

  const formatLastVerified = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <MaterialIcons name="error-outline" size={20} color="#FF3B30" />
        <Text style={[styles.statusText, { color: '#FF3B30' }]}>Privacy Check Failed</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderColor: getStatusColor() }]}>
      <View style={styles.iconContainer}>
        <MaterialIcons name={getStatusIcon()} size={20} color={getStatusColor()} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>
        {status && (
          <Text style={styles.verifiedText}>
            Verified {formatLastVerified(status.lastVerified)}
          </Text>
        )}
      </View>
      {status && status.violationCount > 0 && (
        <View style={styles.violationBadge}>
          <Text style={styles.violationText}>{status.violationCount}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  verifiedText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  violationBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  violationText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});