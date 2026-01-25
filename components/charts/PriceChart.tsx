import React, { useMemo } from 'react';
import { StyleSheet, View, ViewStyle, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle } from 'react-native-svg';

import { useChartPath, generateFallbackChartData } from './hooks/useChartPath';
import { positiveColor, negativeColor } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface PriceChartProps {
  data: number[];
  currentPrice?: number;
  width?: number;
  height?: number;
  isPositive?: boolean;
  showGradient?: boolean;
  showEndDot?: boolean;
  strokeWidth?: number;
  gradientId?: string;
  style?: ViewStyle;
}

export const PriceChart = React.memo(function PriceChart({
  data,
  currentPrice,
  width = SCREEN_WIDTH - 48,
  height = 200,
  isPositive = true,
  showGradient = true,
  showEndDot = true,
  strokeWidth = 2,
  gradientId = 'chartGradient',
  style,
}: PriceChartProps) {
  // Use provided data or generate fallback
  const chartData = useMemo(() => {
    if (data.length > 0) return data;
    if (currentPrice) return generateFallbackChartData(currentPrice);
    return [];
  }, [data, currentPrice]);

  const { linePath, areaPath, lastPoint } = useChartPath(chartData, width, height);

  const lineColor = isPositive ? positiveColor : negativeColor;

  if (chartData.length === 0) {
    return <View style={[styles.container, { width, height }, style]} />;
  }

  return (
    <View style={[styles.container, style]}>
      <Svg width={width} height={height}>
        {showGradient && (
          <Defs>
            <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={lineColor} stopOpacity="0.4" />
              <Stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
        )}
        {showGradient && (
          <Path d={areaPath} fill={`url(#${gradientId})`} />
        )}
        <Path
          d={linePath}
          stroke={lineColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showEndDot && (
          <Circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={6}
            fill={lineColor}
            stroke="#0d1117"
            strokeWidth={2}
          />
        )}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
