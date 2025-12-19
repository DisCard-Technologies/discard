import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { PrivacyDashboard } from '../../components/privacy/PrivacyDashboard';

interface PrivacySettings {
  strictIsolation: boolean;
  correlationPrevention: boolean;
  differentialPrivacy: boolean;
  auditLogging: boolean;
}

interface TransactionIsolationScreenProps {
  navigation: any;
  route: {
    params: {
      cardId: string;
    };
  };
}

export const TransactionIsolationScreen: React.FC<TransactionIsolationScreenProps> = ({
  navigation,
  route,
}) => {
  const { cardId } = route.params;
  const [settings, setSettings] = useState<PrivacySettings>({
    strictIsolation: true,
    correlationPrevention: true,
    differentialPrivacy: true,
    auditLogging: true,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: 'Privacy & Isolation',
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const handleSettingChange = async (setting: keyof PrivacySettings) => {
    if (setting === 'strictIsolation' && settings.strictIsolation) {
      Alert.alert(
        'Disable Strict Isolation?',
        'This will reduce your privacy protection level. Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: () => updateSetting(setting, false),
          },
        ]
      );
    } else {
      updateSetting(setting, !settings[setting]);
    }
  };

  const updateSetting = async (setting: keyof PrivacySettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [setting]: value }));
    
    // In production, this would update the backend
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/v1/privacy/settings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getAuthToken()}`,
            'X-Card-Context': cardId,
          },
          body: JSON.stringify({
            setting,
            value,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update privacy setting');
      }
    } catch (error) {
      console.error('Failed to update setting:', error);
      // Revert the change
      setSettings(prev => ({ ...prev, [setting]: !value }));
      Alert.alert('Error', 'Failed to update privacy setting');
    }
  };

  const getAuthToken = async (): Promise<string> => {
    // This would retrieve the actual auth token from secure storage
    return 'mock-auth-token';
  };

  const generateComplianceReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/v1/privacy/compliance/report?type=privacy_audit`,
        {
          headers: {
            'Authorization': `Bearer ${await getAuthToken()}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      const report = await response.json();
      Alert.alert(
        'Compliance Report Generated',
        `Report ID: ${report.reportId}\nCompliance Score: ${report.complianceScore}%\n\nThe report has been saved to your account.`
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to generate compliance report');
    } finally {
      setLoading(false);
    }
  };

  const renderSettingItem = (
    title: string,
    description: string,
    setting: keyof PrivacySettings,
    icon: string
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <MaterialIcons name={icon as any} size={24} color="#007AFF" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={settings[setting]}
        onValueChange={() => handleSettingChange(setting)}
        trackColor={{ false: '#E5E5EA', true: '#34C759' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <PrivacyDashboard 
          cardId={cardId} 
          onNavigateToDetails={() => navigation.navigate('PrivacyDetails', { cardId })}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Settings</Text>
          
          {renderSettingItem(
            'Strict Transaction Isolation',
            'Prevents any correlation between this card and others',
            'strictIsolation',
            'lock'
          )}

          {renderSettingItem(
            'Correlation Prevention',
            'Actively blocks attempts to link your transactions',
            'correlationPrevention',
            'block'
          )}

          {renderSettingItem(
            'Differential Privacy',
            'Adds noise to analytics to protect individual data',
            'differentialPrivacy',
            'blur-on'
          )}

          {renderSettingItem(
            'Audit Logging',
            'Maintains compliance logs for regulatory requirements',
            'auditLogging',
            'assignment'
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Actions</Text>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={generateComplianceReport}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#007AFF" />
            ) : (
              <>
                <MaterialIcons name="description" size={24} color="#007AFF" />
                <Text style={styles.actionButtonText}>Generate Compliance Report</Text>
                <MaterialIcons name="chevron-right" size={24} color="#C7C7CC" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => navigation.navigate('PrivacyAuditTrail', { cardId })}
          >
            <MaterialIcons name="history" size={24} color="#007AFF" />
            <Text style={styles.actionButtonText}>View Audit Trail</Text>
            <MaterialIcons name="chevron-right" size={24} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => navigation.navigate('PrivacyViolations')}
          >
            <MaterialIcons name="warning" size={24} color="#FF9500" />
            <Text style={styles.actionButtonText}>Privacy Violations</Text>
            <MaterialIcons name="chevron-right" size={24} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <MaterialIcons name="info" size={20} color="#007AFF" />
          <Text style={styles.infoText}>
            Your transactions are protected by advanced privacy-preserving technologies 
            including cryptographic isolation, differential privacy, and continuous 
            monitoring for correlation attempts.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
  },
  settingDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    marginLeft: 12,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#007AFF10',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 8,
    lineHeight: 20,
  },
});