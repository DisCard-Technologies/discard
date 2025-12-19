import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCardOperations } from '../../stores/cards';
import { FraudAlert } from '../../components/security/FraudAlert';
import { CardFreezeControl } from '../../components/security/CardFreezeControl';

interface SecurityIncident {
  incidentId: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: string;
  actionTaken: string;
  riskScore: number;
  resolved: boolean;
}

interface SecurityMetrics {
  totalIncidents: number;
  activeAlerts: number;
  resolvedIncidents: number;
  averageRiskScore: number;
  lastIncidentDate?: string;
}

interface SecurityDashboardProps {
  cardId: string;
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({ cardId }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const cardOperations = useCardOperations();

  useFocusEffect(
    React.useCallback(() => {
      loadSecurityData();
    }, [cardId])
  );

  const loadSecurityData = async () => {
    try {
      setLoading(true);
      
      // Mock data for demonstration - in real app, this would come from API
      const mockIncidents: SecurityIncident[] = [
        {
          incidentId: '1',
          eventType: 'Suspicious Login',
          severity: 'medium',
          detectedAt: new Date().toISOString(),
          actionTaken: 'User notified',
          riskScore: 65,
          resolved: false
        }
      ];
      
      const mockMetrics: SecurityMetrics = {
        totalIncidents: 3,
        activeAlerts: 1,
        resolvedIncidents: 2,
        averageRiskScore: 45,
        lastIncidentDate: new Date().toISOString()
      };

      setIncidents(mockIncidents);
      setMetrics(mockMetrics);
      setNotifications([]);
      setMfaEnabled(true);

    } catch (error) {
      console.error('Failed to load security data:', error);
      Alert.alert('Error', 'Failed to load security information');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSecurityData();
    setRefreshing(false);
  };

  const handleNotificationAction = async (actionId: string) => {
    // Navigate to specific screens based on action
    console.log('Notification action:', actionId);
  };

  const handleNotificationDismiss = () => {
    // Refresh notifications after dismissal
    loadSecurityData();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#DC2626';
      case 'high':
        return '#EA580C';
      case 'medium':
        return '#F59E0B';
      case 'low':
        return '#3B82F6';
      default:
        return '#6B7280';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading security information...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Security Dashboard</Text>
        <Text style={styles.subtitle}>Monitor your card's security status</Text>
      </View>

      {/* Active Security Alerts */}
      {notifications.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Security Alerts</Text>
          {notifications.map((notification) => (
            <FraudAlert
              key={notification.notificationId}
              notification={notification}
              onActionPress={handleNotificationAction}
              onDismiss={handleNotificationDismiss}
            />
          ))}
        </View>
      )}

      {/* Security Overview Metrics */}
      {metrics && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security Overview</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Ionicons name="shield-checkmark" size={24} color="#059669" />
              <Text style={styles.metricValue}>{metrics.resolvedIncidents}</Text>
              <Text style={styles.metricLabel}>Resolved</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="warning" size={24} color="#F59E0B" />
              <Text style={styles.metricValue}>{metrics.activeAlerts}</Text>
              <Text style={styles.metricLabel}>Active Alerts</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="analytics" size={24} color="#3B82F6" />
              <Text style={styles.metricValue}>{Math.round(metrics.averageRiskScore)}</Text>
              <Text style={styles.metricLabel}>Avg Risk Score</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="time" size={24} color="#6B7280" />
              <Text style={styles.metricValue}>
                {metrics.lastIncidentDate ? formatDate(metrics.lastIncidentDate) : 'None'}
              </Text>
              <Text style={styles.metricLabel}>Last Incident</Text>
            </View>
          </View>
        </View>
      )}

      {/* Card Controls */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Card Controls</Text>
        <CardFreezeControl cardId={cardId} />
      </View>

      {/* Security Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security Settings</Text>
        
        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="key" size={24} color="#3B82F6" />
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Multi-Factor Authentication</Text>
              <Text style={styles.settingDescription}>
                {mfaEnabled ? 'Enabled - Extra security for transactions' : 'Add extra security to your account'}
              </Text>
            </View>
          </View>
          <View style={styles.settingRight}>
            {mfaEnabled && <Ionicons name="checkmark-circle" size={20} color="#059669" />}
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="notifications" size={24} color="#3B82F6" />
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Security Notifications</Text>
              <Text style={styles.settingDescription}>Configure how you receive security alerts</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <Ionicons name="document-text" size={24} color="#3B82F6" />
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Security Report</Text>
              <Text style={styles.settingDescription}>Download detailed security activity report</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Recent Security Incidents */}
      {incidents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Security Activity</Text>
          {incidents.slice(0, 5).map((incident) => (
            <View key={incident.incidentId} style={styles.incidentItem}>
              <View style={styles.incidentLeft}>
                <View style={[
                  styles.severityIndicator,
                  { backgroundColor: getSeverityColor(incident.severity) }
                ]} />
                <View style={styles.incidentDetails}>
                  <Text style={styles.incidentTitle}>
                    {incident.eventType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                  <Text style={styles.incidentDate}>
                    {formatDate(incident.detectedAt)}
                  </Text>
                </View>
              </View>
              <View style={styles.incidentRight}>
                <Text style={styles.riskScore}>{incident.riskScore}/100</Text>
                {incident.resolved && (
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Security Tips */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security Tips</Text>
        <View style={styles.tipsContainer}>
          <View style={styles.tipItem}>
            <Ionicons name="shield" size={20} color="#3B82F6" />
            <Text style={styles.tipText}>
              Enable MFA for additional protection on high-risk transactions
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="eye" size={20} color="#3B82F6" />
            <Text style={styles.tipText}>
              Monitor your transactions regularly for suspicious activity
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="lock-closed" size={20} color="#3B82F6" />
            <Text style={styles.tipText}>
              Freeze your card immediately if you suspect fraud
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280'
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280'
  },
  section: {
    marginTop: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    marginHorizontal: 20
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16
  },
  metricCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    margin: '1.5%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
    marginBottom: 4
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center'
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  settingText: {
    marginLeft: 16,
    flex: 1
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280'
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  incidentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  incidentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  severityIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12
  },
  incidentDetails: {
    flex: 1
  },
  incidentTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2
  },
  incidentDate: {
    fontSize: 12,
    color: '#6B7280'
  },
  incidentRight: {
    alignItems: 'flex-end'
  },
  riskScore: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4
  },
  tipsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingRight: 8
  },
  tipText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20
  }
});