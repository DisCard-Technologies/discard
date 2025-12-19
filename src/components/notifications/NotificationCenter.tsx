import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Mock API service - in real implementation, this would be imported
const mockApiService = {
  async getNotificationHistory(params: any) {
    // Mock implementation
    return {
      history: [],
      pagination: { total: 0, hasMore: false }
    };
  },
  async deleteNotification(id: string) {
    return { deleted: true };
  },
  async markAsRead(id: string) {
    return { read: true };
  }
};

// Inline type definitions to resolve missing dependencies
interface NotificationItem {
  notificationId: string;
  notificationType: 'transaction' | 'spending_limit' | 'decline' | 'unusual_activity';
  deliveryChannel: 'push' | 'email';
  status: 'pending' | 'delivered' | 'failed' | 'read';
  content: {
    title: string;
    message: string;
    actionButtons?: string[];
  };
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
}

interface NotificationCenterProps {
  cardContext?: string;
  onNotificationPress?: (notification: NotificationItem) => void;
  maxItems?: number;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  cardContext,
  onNotificationPress,
  maxItems = 50
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (offset: number = 0, isRefresh: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const params = {
        limit: maxItems,
        offset,
        ...(cardContext && { cardContext })
      };

      const response = await mockApiService.getNotificationHistory(params);
      
      if (isRefresh || offset === 0) {
        setNotifications(response.history);
      } else {
        setNotifications(prev => [...prev, ...response.history]);
      }
      
      setHasMore(response.pagination.hasMore);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cardContext, maxItems]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleRefresh = useCallback(() => {
    fetchNotifications(0, true);
  }, [fetchNotifications]);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchNotifications(notifications.length);
    }
  }, [loading, hasMore, notifications.length, fetchNotifications]);

  const handleNotificationPress = useCallback(async (notification: NotificationItem) => {
    // Mark as read if not already read
    if (notification.status !== 'read') {
      try {
        await mockApiService.markAsRead(notification.notificationId);
        setNotifications(prev => 
          prev.map(n => 
            n.notificationId === notification.notificationId 
              ? { ...n, status: 'read' as const, readAt: new Date().toISOString() }
              : n
          )
        );
      } catch (err) {
        console.error('Error marking notification as read:', err);
      }
    }

    onNotificationPress?.(notification);
  }, [onNotificationPress]);

  const handleDeleteNotification = useCallback((notificationId: string) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await mockApiService.deleteNotification(notificationId);
              setNotifications(prev => 
                prev.filter(n => n.notificationId !== notificationId)
              );
            } catch (err) {
              console.error('Error deleting notification:', err);
              Alert.alert('Error', 'Failed to delete notification');
            }
          }
        }
      ]
    );
  }, []);

  const getNotificationIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'transaction':
        return 'card-outline';
      case 'spending_limit':
        return 'warning-outline';
      case 'decline':
        return 'close-circle-outline';
      case 'unusual_activity':
        return 'shield-outline';
      default:
        return 'notifications-outline';
    }
  };

  const getNotificationColor = (type: string, status: string) => {
    if (status === 'read') return '#9CA3AF';
    
    switch (type) {
      case 'transaction':
        return '#10B981';
      case 'spending_limit':
        return '#F59E0B';
      case 'decline':
        return '#EF4444';
      case 'unusual_activity':
        return '#8B5CF6';
      default:
        return '#6B7280';
    }
  };

  const formatRelativeTime = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return then.toLocaleDateString();
  };

  const renderNotificationItem = ({ item }: { item: NotificationItem }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        item.status === 'read' ? styles.readNotification : styles.unreadNotification
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationHeader}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={getNotificationIcon(item.notificationType)}
            size={20}
            color={getNotificationColor(item.notificationType, item.status)}
          />
        </View>
        <View style={styles.contentContainer}>
          <Text style={[
            styles.notificationTitle,
            item.status === 'read' && styles.readText
          ]}>
            {item.content.title}
          </Text>
          <Text style={[
            styles.notificationMessage,
            item.status === 'read' && styles.readText
          ]} numberOfLines={2}>
            {item.content.message}
          </Text>
          <Text style={styles.timestamp}>
            {formatRelativeTime(item.sentAt)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteNotification(item.notificationId)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {item.content.actionButtons && item.content.actionButtons.length > 0 && (
        <View style={styles.actionButtons}>
          {item.content.actionButtons.map((buttonText, index) => (
            <TouchableOpacity
              key={`${item.notificationId}-${buttonText}-${index}`}
              style={styles.actionButton}
              onPress={() => {
                // Handle action button press
                console.log(`Action button pressed: ${buttonText}`);
              }}
            >
              <Text style={styles.actionButtonText}>{buttonText}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {item.status !== 'read' && <View style={styles.unreadIndicator} />}
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="notifications-outline" size={64} color="#D1D5DB" />
      <Text style={styles.emptyStateTitle}>No Notifications</Text>
      <Text style={styles.emptyStateMessage}>
        You'll see your transaction alerts and spending notifications here
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.errorState}>
      <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
      <Text style={styles.errorTitle}>Failed to Load</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={() => fetchNotifications()}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  if (error && notifications.length === 0) {
    return renderError();
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        renderItem={renderNotificationItem}
        keyExtractor={(item) => item.notificationId}
        ListEmptyComponent={!loading ? renderEmptyState : null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#10B981']}
            tintColor="#10B981"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.1}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationItem: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative',
  },
  unreadNotification: {
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  readNotification: {
    opacity: 0.8,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  contentContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 8,
  },
  timestamp: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  readText: {
    color: '#9CA3AF',
  },
  deleteButton: {
    padding: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
  },
  actionButtonText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  unreadIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateMessage: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  errorState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default NotificationCenter;