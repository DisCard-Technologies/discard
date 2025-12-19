import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { IsolationStatusIndicator } from './IsolationStatusIndicator';

interface PrivacyMetrics {
  isolationScore: number;
  privacyBudgetUsed: number;
  correlationAttempts: number;
  lastAuditDate: string;
  complianceStatus: 'compliant' | 'warning' | 'non_compliant';
}

interface PrivacyDashboardProps {
  cardId: string;
  onNavigateToDetails?: () => void;
}

export const PrivacyDashboard: React.FC<PrivacyDashboardProps> = ({
  cardId,
  onNavigateToDetails
}) => {
  const [metrics, setMetrics] = useState<PrivacyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPrivacyMetrics();
  }, [cardId]);

  const fetchPrivacyMetrics = async () => {
    try {
      setError(null);
      
      // Fetch isolation metrics
      const isolationResponse = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/v1/privacy/isolation/metrics`,
        {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
            'X-Card-Context': cardId
          }
        }
      );

      // Fetch privacy budget status
      const budgetResponse = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/v1/analytics/privacy/budget`,
        {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          }
        }
      );

      if (!isolationResponse.ok || !budgetResponse.ok) {
        throw new Error('Failed to fetch privacy metrics');
      }

      const isolationData = await isolationResponse.json();
      const budgetData = await budgetResponse.json();

      // Mock compliance data - in production this would come from the API
      const mockMetrics: PrivacyMetrics = {
        isolationScore: isolationData.continuousIsolation.verified ? 100 : 75,
        privacyBudgetUsed: parseFloat(budgetData.budgetUtilization),
        correlationAttempts: isolationData.continuousIsolation.violations,
        lastAuditDate: new Date().toISOString(),
        complianceStatus: isolationData.continuousIsolation.verified ? 'compliant' : 'warning'
      };

      setMetrics(mockMetrics);
    } catch (err) {
      setError('Unable to load privacy metrics');
      console.error('Privacy metrics error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getAuthToken = async (): Promise<string> => {
    // This would retrieve the actual auth token from secure storage
    return 'mock-auth-token';
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchPrivacyMetrics();
  };

  const getComplianceColor = (status: string) => {
    switch (status) {
      case 'compliant':
        return '#34C759';
      case 'warning':
        return '#FF9500';
      case 'non_compliant':
        return '#FF3B30';
      default:
        return '#8E8E93';
    }
  };

  const renderMetricCard = (
    title: string,
    value: string | number,
    icon: string,
    color: string,
    subtitle?: string
  ) => (
    <TouchableOpacity style={styles.metricCard} activeOpacity={0.7}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}20` }]}>
        <MaterialIcons name={icon as any} size={24} color={color} />
      </View>
      <View style={styles.metricContent}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricTitle}>{title}</Text>
        {subtitle && <Text style={styles.metricSubtitle}>{subtitle}</Text>}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading privacy metrics...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color="#FF3B30" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchPrivacyMetrics}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Privacy Protection</Text>
        <TouchableOpacity onPress={onNavigateToDetails}>
          <MaterialIcons name="info-outline" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <IsolationStatusIndicator cardId={cardId} />

      <View style={styles.metricsGrid}>
        {renderMetricCard(
          'Isolation Score',
          `${metrics?.isolationScore || 0}%`,
          'shield',
          metrics?.isolationScore === 100 ? '#34C759' : '#FF9500',
          'Transaction isolation level'
        )}

        {renderMetricCard(
          'Privacy Budget',
          `${metrics?.privacyBudgetUsed || 0}%`,
          'donut-small',
          metrics?.privacyBudgetUsed && metrics.privacyBudgetUsed < 80 ? '#34C759' : '#FF9500',
          'Daily budget consumed'
        )}

        {renderMetricCard(
          'Blocked Correlations',
          metrics?.correlationAttempts || 0,
          'block',
          '#007AFF',
          'Attempts prevented'
        )}

        {renderMetricCard(
          'Compliance',
          metrics?.complianceStatus.toUpperCase() || 'UNKNOWN',
          'verified-user',
          getComplianceColor(metrics?.complianceStatus || ''),
          'Regulatory status'
        )}
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>Privacy Features Active</Text>
        <View style={styles.featureItem}>
          <MaterialIcons name="check-circle" size={20} color="#34C759" />
          <Text style={styles.featureText}>Transaction Isolation</Text>
        </View>
        <View style={styles.featureItem}>
          <MaterialIcons name="check-circle" size={20} color="#34C759" />
          <Text style={styles.featureText}>Differential Privacy Analytics</Text>
        </View>
        <View style={styles.featureItem}>
          <MaterialIcons name="check-circle" size={20} color="#34C759" />
          <Text style={styles.featureText}>Correlation Prevention</Text>
        </View>
        <View style={styles.featureItem}>
          <MaterialIcons name="check-circle" size={20} color="#34C759" />
          <Text style={styles.featureText}>Continuous Monitoring</Text>
        </View>
      </View>

      <View style={styles.auditInfo}>
        <MaterialIcons name="assignment" size={20} color="#8E8E93" />
        <Text style={styles.auditText}>
          Last privacy audit: {metrics?.lastAuditDate ? 
            new Date(metrics.lastAuditDate).toLocaleDateString() : 
            'Never'
          }
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8E8E93',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    marginTop: 8,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    margin: '1%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricContent: {
    alignItems: 'flex-start',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  metricTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3C3C43',
    marginTop: 4,
  },
  metricSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginTop: 8,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  featureText: {
    fontSize: 16,
    color: '#3C3C43',
    marginLeft: 12,
  },
  auditInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    marginTop: 8,
  },
  auditText: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 8,
  },
});