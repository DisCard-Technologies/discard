import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView
} from 'react-native';

interface CategoryBreakdown {
  [category: string]: number;
}

interface SpendingTrend {
  date: string;
  amount: number;
}

interface TransactionAnalytics {
  totalSpent: number;
  transactionCount: number;
  categoryBreakdown: CategoryBreakdown;
  averageTransaction: number;
  spendingTrends?: SpendingTrend[];
}

interface TransactionAnalyticsProps {
  analytics: TransactionAnalytics;
  cardId: string;
}

const screenWidth = Dimensions.get('window').width;

export const TransactionAnalytics: React.FC<TransactionAnalyticsProps> = ({
  analytics,
  cardId
}) => {
  const formatAmount = (amount: number) => {
    return `$${(amount / 100).toFixed(2)}`;
  };

  const getCategoryDisplayName = (category: string) => {
    const categoryNames: { [key: string]: string } = {
      grocery: 'Grocery',
      restaurant: 'Restaurant', 
      gas: 'Gas Station',
      retail: 'Retail',
      pharmacy: 'Pharmacy',
      transportation: 'Transportation',
      entertainment: 'Entertainment',
      other: 'Other'
    };
    return categoryNames[category] || category;
  };

  const getCategoryColor = (category: string) => {
    const categoryColors: { [key: string]: string } = {
      grocery: '#10B981',
      restaurant: '#F59E0B',
      gas: '#EF4444',
      retail: '#8B5CF6',
      pharmacy: '#06B6D4',
      transportation: '#F97316',
      entertainment: '#EC4899',
      other: '#6B7280'
    };
    return categoryColors[category] || '#6B7280';
  };

  const renderCategoryBreakdown = () => {
    const categories = Object.entries(analytics.categoryBreakdown)
      .filter(([_, amount]) => amount > 0)
      .sort(([_, a], [__, b]) => b - a);

    if (categories.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No spending data available</Text>
        </View>
      );
    }

    const maxAmount = Math.max(...categories.map(([_, amount]) => amount));

    return (
      <View style={styles.categoryContainer}>
        {categories.map(([category, amount]) => {
          const percentage = ((amount / analytics.totalSpent) * 100).toFixed(1);
          const barWidth = (amount / maxAmount) * (screenWidth - 120);
          
          return (
            <View key={category} style={styles.categoryRow}>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName}>
                  {getCategoryDisplayName(category)}
                </Text>
                <Text style={styles.categoryAmount}>
                  {formatAmount(amount)} ({percentage}%)
                </Text>
              </View>
              <View style={styles.categoryBarContainer}>
                <View 
                  style={[
                    styles.categoryBar, 
                    { 
                      width: barWidth,
                      backgroundColor: getCategoryColor(category)
                    }
                  ]} 
                />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderSpendingTrends = () => {
    if (!analytics.spendingTrends || analytics.spendingTrends.length === 0) {
      return null;
    }

    // Simple line chart representation using bars
    const maxTrendAmount = Math.max(...analytics.spendingTrends.map(trend => trend.amount));
    const chartHeight = 120;

    return (
      <View style={styles.trendsContainer}>
        <Text style={styles.sectionTitle}>Weekly Spending Trend</Text>
        <View style={styles.chartContainer}>
          {analytics.spendingTrends.map((trend, index) => {
            const barHeight = maxTrendAmount > 0 ? (trend.amount / maxTrendAmount) * chartHeight : 0;
            const date = new Date(trend.date);
            const dateLabel = date.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric' 
            });
            
            return (
              <View key={index} style={styles.chartBar}>
                <View style={[styles.bar, { height: barHeight || 2 }]} />
                <Text style={styles.chartLabel}>{dateLabel}</Text>
                <Text style={styles.chartValue}>
                  {formatAmount(trend.amount)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Spent</Text>
          <Text style={styles.summaryValue}>
            {formatAmount(analytics.totalSpent)}
          </Text>
        </View>
        
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Transactions</Text>
          <Text style={styles.summaryValue}>
            {analytics.transactionCount}
          </Text>
        </View>
        
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Average</Text>
          <Text style={styles.summaryValue}>
            {formatAmount(analytics.averageTransaction)}
          </Text>
        </View>
      </View>

      {/* Category Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spending by Category</Text>
        {renderCategoryBreakdown()}
      </View>

      {/* Spending Trends */}
      {renderSpendingTrends()}

      {/* Privacy Notice */}
      <View style={styles.privacyNotice}>
        <Text style={styles.privacyTitle}>🔒 Privacy Notice</Text>
        <Text style={styles.privacyText}>
          These analytics are computed in real-time and are not stored or 
          correlated across cards. Your spending patterns remain private to this 
          disposable card only.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 16,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  categoryContainer: {
    marginTop: 8,
  },
  categoryRow: {
    marginBottom: 16,
  },
  categoryInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  categoryAmount: {
    fontSize: 14,
    color: '#6B7280',
  },
  categoryBarContainer: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryBar: {
    height: '100%',
    borderRadius: 4,
  },
  trendsContainer: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
    marginTop: 16,
    paddingHorizontal: 8,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  bar: {
    width: 24,
    backgroundColor: '#007AFF',
    borderRadius: 2,
    minHeight: 2,
  },
  chartLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  chartValue: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
  privacyNotice: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0EA5E9',
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 14,
    color: '#0369A1',
    lineHeight: 20,
  },
});