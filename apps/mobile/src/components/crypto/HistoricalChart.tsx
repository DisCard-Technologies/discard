/**
 * HistoricalChart Component for React Native
 * Price trend visualization for cryptocurrency rates with interactive features
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  ViewStyle,
  Dimensions,
} from 'react-native';
import {
  HistoricalRateRequest,
  HistoricalRateResponse,
  HistoricalRatePoint,
  CryptoWalletError,
  CRYPTO_ERROR_CODES,
} from '@discard/shared';

interface HistoricalChartProps {
  symbol: string;
  onError?: (error: CryptoWalletError) => void;
  style?: ViewStyle;
}

interface TimeframeOption {
  key: '1h' | '24h' | '7d';
  label: string;
  shortLabel: string;
}

interface ChartPoint {
  x: number;
  y: number;
  price: number;
  timestamp: Date;
}

const { width: screenWidth } = Dimensions.get('window');
const CHART_WIDTH = screenWidth - 80; // Account for padding
const CHART_HEIGHT = 200;

const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { key: '1h', label: '1 Hour', shortLabel: '1H' },
  { key: '24h', label: '24 Hours', shortLabel: '24H' },
  { key: '7d', label: '7 Days', shortLabel: '7D' },
];

const CRYPTO_ICONS: { [key: string]: string } = {
  BTC: '₿',
  ETH: 'Ξ',
  USDT: '₮',
  USDC: '$',
  XRP: 'X',
};

const HistoricalChart: React.FC<HistoricalChartProps> = ({
  symbol,
  onError,
  style,
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1h' | '24h' | '7d'>('24h');
  const [historicalData, setHistoricalData] = useState<HistoricalRateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<ChartPoint | null>(null);

  useEffect(() => {
    fetchHistoricalData();
  }, [symbol, selectedTimeframe]);

  const getAuthToken = async (): Promise<string> => {
    // This would integrate with your auth system
    return 'mock-token';
  };

  const fetchHistoricalData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const request: HistoricalRateRequest = {
        symbol,
        timeframe: selectedTimeframe,
        resolution: selectedTimeframe === '1h' ? '1m' : selectedTimeframe === '24h' ? '5m' : '1h',
      };

      const response = await fetch('/api/v1/crypto/rates/historical', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch historical data');
      }

      const data = await response.json();
      const historical = data.data as HistoricalRateResponse;
      
      setHistoricalData(historical);

    } catch (error) {
      const walletError: CryptoWalletError = {
        code: CRYPTO_ERROR_CODES.RATE_FETCH_FAILED,
        message: error instanceof Error ? error.message : 'Historical data fetch failed',
        details: { originalError: error },
      };
      
      setError(walletError.message);
      onError?.(walletError);
      setHistoricalData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (price: number): string => {
    if (price < 0.01) return price.toExponential(2);
    if (price < 1) return price.toFixed(6);
    if (price < 100) return price.toFixed(4);
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatTimestamp = (timestamp: Date, timeframe: string): string => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (timeframe === '1h') {
      return `${minutes}m ago`;
    } else if (timeframe === '24h') {
      if (hours < 1) return `${minutes}m ago`;
      return `${hours}h ago`;
    } else {
      if (days < 1) return `${hours}h ago`;
      return `${days}d ago`;
    }
  };

  const calculatePriceChange = (dataPoints: HistoricalRatePoint[]): { change: number; percentage: number } => {
    if (dataPoints.length < 2) return { change: 0, percentage: 0 };

    const latest = parseFloat(dataPoints[dataPoints.length - 1].price);
    const earliest = parseFloat(dataPoints[0].price);
    const change = latest - earliest;
    const percentage = (change / earliest) * 100;

    return { change, percentage };
  };

  const convertToChartPoints = (dataPoints: HistoricalRatePoint[]): ChartPoint[] => {
    if (dataPoints.length === 0) return [];

    const prices = dataPoints.map(p => parseFloat(p.price));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    return dataPoints.map((point, index) => {
      const price = parseFloat(point.price);
      const x = (index / (dataPoints.length - 1)) * CHART_WIDTH;
      const y = priceRange > 0 
        ? CHART_HEIGHT - ((price - minPrice) / priceRange) * CHART_HEIGHT
        : CHART_HEIGHT / 2;

      return {
        x,
        y,
        price,
        timestamp: new Date(point.timestamp),
      };
    });
  };

  const createSvgPath = (points: ChartPoint[]): string => {
    if (points.length === 0) return '';

    let path = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const currentPoint = points[i];
      
      // Create smooth curve using cubic bezier
      const cpx1 = prevPoint.x + (currentPoint.x - prevPoint.x) * 0.5;
      const cpx2 = currentPoint.x - (currentPoint.x - prevPoint.x) * 0.5;
      
      path += ` C ${cpx1} ${prevPoint.y} ${cpx2} ${currentPoint.y} ${currentPoint.x} ${currentPoint.y}`;
    }
    
    return path;
  };

  const handleChartPress = (event: any, chartPoints: ChartPoint[]) => {
    const { locationX } = event.nativeEvent;
    
    // Find closest point
    let closestPoint = chartPoints[0];
    let minDistance = Math.abs(locationX - chartPoints[0].x);

    chartPoints.forEach(point => {
      const distance = Math.abs(locationX - point.x);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    });

    setSelectedPoint(closestPoint);
  };

  const renderTimeframeSelector = () => (
    <View style={styles.timeframeSelector}>
      {TIMEFRAME_OPTIONS.map((option) => (
        <TouchableOpacity
          key={option.key}
          style={[
            styles.timeframeOption,
            selectedTimeframe === option.key && styles.timeframeOptionSelected,
          ]}
          onPress={() => setSelectedTimeframe(option.key)}
        >
          <Text style={[
            styles.timeframeText,
            selectedTimeframe === option.key && styles.timeframeTextSelected,
          ]}>
            {option.shortLabel}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderChart = () => {
    if (!historicalData || historicalData.dataPoints.length === 0) {
      return (
        <View style={styles.emptyChart}>
          <Text style={styles.emptyChartText}>No data available</Text>
        </View>
      );
    }

    const chartPoints = convertToChartPoints(historicalData.dataPoints);
    const svgPath = createSvgPath(chartPoints);
    const { change, percentage } = calculatePriceChange(historicalData.dataPoints);
    const isPositive = change >= 0;

    return (
      <View style={styles.chartContainer}>
        {/* Price Info */}
        <View style={styles.priceInfo}>
          <View style={styles.currentPrice}>
            <Text style={styles.cryptoSymbol}>
              {CRYPTO_ICONS[symbol] || symbol} {symbol}
            </Text>
            <Text style={styles.priceValue}>
              ${formatPrice(parseFloat(historicalData.dataPoints[historicalData.dataPoints.length - 1].price))}
            </Text>
          </View>
          <View style={styles.priceChange}>
            <Text style={[
              styles.changeValue,
              isPositive ? styles.changePositive : styles.changeNegative,
            ]}>
              {isPositive ? '+' : ''}${formatPrice(Math.abs(change))}
            </Text>
            <Text style={[
              styles.changePercentage,
              isPositive ? styles.changePositive : styles.changeNegative,
            ]}>
              ({isPositive ? '+' : ''}{percentage.toFixed(2)}%)
            </Text>
          </View>
        </View>

        {/* Chart Area */}
        <View style={styles.chartArea}>
          <TouchableOpacity
            style={styles.chartTouchable}
            onPress={(event) => handleChartPress(event, chartPoints)}
            activeOpacity={1}
          >
            {/* Simple line chart using View components */}
            <View style={styles.chartCanvas}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
                <View
                  key={index}
                  style={[
                    styles.gridLine,
                    { top: CHART_HEIGHT * ratio },
                  ]}
                />
              ))}

              {/* Chart line */}
              {chartPoints.map((point, index) => (
                <View
                  key={index}
                  style={[
                    styles.chartPoint,
                    {
                      left: point.x - 1,
                      top: point.y - 1,
                      backgroundColor: isPositive ? '#10B981' : '#EF4444',
                    },
                  ]}
                />
              ))}

              {/* Selected point indicator */}
              {selectedPoint && (
                <View
                  style={[
                    styles.selectedPoint,
                    {
                      left: selectedPoint.x - 4,
                      top: selectedPoint.y - 4,
                    },
                  ]}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Selected Point Info */}
        {selectedPoint && (
          <View style={styles.selectedPointInfo}>
            <Text style={styles.selectedPointPrice}>
              ${formatPrice(selectedPoint.price)}
            </Text>
            <Text style={styles.selectedPointTime}>
              {formatTimestamp(selectedPoint.timestamp, selectedTimeframe)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, style]} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Price Chart</Text>
          {renderTimeframeSelector()}
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.errorDismiss}
              onPress={() => setError(null)}
            >
              <Text style={styles.errorDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading chart data...</Text>
          </View>
        ) : (
          renderChart()
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  content: {
    padding: 20,
    gap: 20,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },

  // Timeframe Selector
  timeframeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },

  timeframeOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },

  timeframeOptionSelected: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },

  timeframeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },

  timeframeTextSelected: {
    color: '#1F2937',
  },

  // Chart Container
  chartContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    gap: 16,
  },

  priceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  currentPrice: {
    gap: 4,
  },

  cryptoSymbol: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },

  priceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },

  priceChange: {
    alignItems: 'flex-end',
    gap: 2,
  },

  changeValue: {
    fontSize: 16,
    fontWeight: '600',
  },

  changePercentage: {
    fontSize: 12,
    fontWeight: '500',
  },

  changePositive: {
    color: '#10B981',
  },

  changeNegative: {
    color: '#EF4444',
  },

  // Chart Area
  chartArea: {
    height: CHART_HEIGHT,
    marginVertical: 10,
  },

  chartTouchable: {
    flex: 1,
  },

  chartCanvas: {
    flex: 1,
    position: 'relative',
  },

  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#F3F4F6',
  },

  chartPoint: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
  },

  selectedPoint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: 'white',
  },

  // Selected Point Info
  selectedPointInfo: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },

  selectedPointPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },

  selectedPointTime: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Empty State
  emptyChart: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    height: CHART_HEIGHT + 100,
  },

  emptyChartText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Error and Loading States
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },

  errorText: {
    fontSize: 14,
    color: '#7F1D1D',
    marginBottom: 8,
  },

  errorDismiss: {
    alignSelf: 'flex-start',
  },

  errorDismissText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  loadingContainer: {
    backgroundColor: 'white',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
    height: CHART_HEIGHT + 100,
    justifyContent: 'center',
  },

  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
});

export default HistoricalChart;