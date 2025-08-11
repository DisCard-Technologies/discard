import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCards } from '../../../lib/hooks/useCards';

interface CardFreezeControlProps {
  cardId: string;
  initialFrozenState?: boolean;
  onStatusChange?: (isFrozen: boolean) => void;
  compact?: boolean;
}

export const CardFreezeControl: React.FC<CardFreezeControlProps> = ({
  cardId,
  initialFrozenState = false,
  onStatusChange,
  compact = false
}) => {
  const [isFrozen, setIsFrozen] = useState(initialFrozenState);
  const [isLoading, setIsLoading] = useState(false);
  const [lastAction, setLastAction] = useState<'freeze' | 'unfreeze' | null>(null);
  const { freezeCard, unfreezeCard, getCardStatus } = useCards();

  useEffect(() => {
    // Fetch current card status on mount
    loadCardStatus();
  }, [cardId]);

  const loadCardStatus = async () => {
    try {
      const status = await getCardStatus(cardId);
      setIsFrozen(status.isFrozen);
    } catch (error) {
      console.error('Failed to load card status:', error);
    }
  };

  const handleToggle = async () => {
    const action = isFrozen ? 'unfreeze' : 'freeze';
    const actionText = isFrozen ? 'Unfreeze' : 'Freeze';
    const warningMessage = isFrozen
      ? 'Are you sure you want to unfreeze this card? It will be immediately available for transactions.'
      : 'Are you sure you want to freeze this card? All transactions will be blocked until you unfreeze it.';

    Alert.alert(
      `${actionText} Card`,
      warningMessage,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: actionText,
          style: action === 'freeze' ? 'destructive' : 'default',
          onPress: async () => {
            setIsLoading(true);
            setLastAction(action);

            try {
              let result;
              if (action === 'freeze') {
                result = await freezeCard(cardId, 'manual_freeze');
              } else {
                result = await unfreezeCard(cardId);
              }

              if (result.success) {
                setIsFrozen(!isFrozen);
                if (onStatusChange) {
                  onStatusChange(!isFrozen);
                }

                Alert.alert(
                  'Success',
                  `Your card has been ${action === 'freeze' ? 'frozen' : 'unfrozen'} successfully.`,
                  [{ text: 'OK' }]
                );
              } else {
                throw new Error(result.error || 'Operation failed');
              }
            } catch (error) {
              Alert.alert(
                'Error',
                `Failed to ${action} card. Please try again later.`,
                [{ text: 'OK' }]
              );
            } finally {
              setIsLoading(false);
              setLastAction(null);
            }
          }
        }
      ]
    );
  };

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactLeft}>
          <Ionicons
            name={isFrozen ? 'lock-closed' : 'lock-open'}
            size={20}
            color={isFrozen ? '#DC2626' : '#059669'}
          />
          <Text style={styles.compactLabel}>
            {isFrozen ? 'Card Frozen' : 'Card Active'}
          </Text>
        </View>
        <Switch
          value={isFrozen}
          onValueChange={handleToggle}
          disabled={isLoading}
          trackColor={{ false: '#E5E7EB', true: '#FCA5A5' }}
          thumbColor={isFrozen ? '#DC2626' : '#059669'}
          ios_backgroundColor="#E5E7EB"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, isFrozen && styles.frozenContainer]}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={isFrozen ? 'lock-closed' : 'lock-open'}
            size={32}
            color={isFrozen ? '#DC2626' : '#059669'}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Card Security Control</Text>
          <Text style={[styles.status, isFrozen ? styles.frozenStatus : styles.activeStatus]}>
            {isFrozen ? 'FROZEN' : 'ACTIVE'}
          </Text>
        </View>
      </View>

      <Text style={styles.description}>
        {isFrozen
          ? 'Your card is currently frozen. No transactions can be made until you unfreeze it.'
          : 'Your card is active and ready for use. You can freeze it anytime for security.'}
      </Text>

      {isFrozen && (
        <View style={styles.warningBox}>
          <Ionicons name="warning" size={20} color="#DC2626" />
          <Text style={styles.warningText}>
            All transactions are blocked while your card is frozen
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.actionButton,
          isFrozen ? styles.unfreezeButton : styles.freezeButton,
          isLoading && styles.disabledButton
        ]}
        onPress={handleToggle}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons
              name={isFrozen ? 'lock-open' : 'lock-closed'}
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.actionButtonText}>
              {isFrozen ? 'Unfreeze Card' : 'Freeze Card'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>When to freeze your card:</Text>
        <View style={styles.infoItem}>
          <Ionicons name="checkmark-circle" size={16} color="#6B7280" />
          <Text style={styles.infoText}>You've lost your card</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="checkmark-circle" size={16} color="#6B7280" />
          <Text style={styles.infoText}>You suspect fraudulent activity</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="checkmark-circle" size={16} color="#6B7280" />
          <Text style={styles.infoText}>You want to temporarily disable spending</Text>
        </View>
      </View>

      {lastAction && (
        <View style={styles.lastActionContainer}>
          <Text style={styles.lastActionText}>
            Last action: Card {lastAction === 'freeze' ? 'frozen' : 'unfrozen'} just now
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3
  },
  frozenContainer: {
    borderWidth: 2,
    borderColor: '#DC2626'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16
  },
  headerText: {
    flex: 1
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4
  },
  status: {
    fontSize: 14,
    fontWeight: '700'
  },
  activeStatus: {
    color: '#059669'
  },
  frozenStatus: {
    color: '#DC2626'
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 16
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  warningText: {
    fontSize: 14,
    color: '#DC2626',
    marginLeft: 8,
    flex: 1
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 20
  },
  freezeButton: {
    backgroundColor: '#DC2626'
  },
  unfreezeButton: {
    backgroundColor: '#059669'
  },
  disabledButton: {
    opacity: 0.6
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8
  },
  infoSection: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1
  },
  lastActionContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB'
  },
  lastActionText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic'
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  compactLabel: {
    fontSize: 16,
    color: '#374151',
    marginLeft: 8,
    fontWeight: '500'
  }
});