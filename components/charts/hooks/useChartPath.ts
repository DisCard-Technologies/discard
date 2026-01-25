import { useMemo } from 'react';

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartPathResult {
  linePath: string;
  areaPath: string;
  lastPoint: ChartPoint;
}

/**
 * Creates a smooth SVG path from data points using quadratic curves
 */
export function createChartPath(
  data: number[],
  width: number,
  height: number,
  padding: number = 8
): { path: string; lastPoint: ChartPoint } {
  if (data.length === 0) return { path: '', lastPoint: { x: 0, y: 0 } };

  const minValue = Math.min(...data);
  const maxValue = Math.max(...data);
  const range = maxValue - minValue || 1;

  const xStep = width / (data.length - 1);
  const chartHeight = height - padding * 2;

  const points = data.map((value, index) => {
    const x = index * xStep;
    const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
    return { x, y };
  });

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    path += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + curr.y) / 2}`;
  }
  path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;

  return { path, lastPoint: points[points.length - 1] };
}

/**
 * Creates a closed area path for gradient fill below the line
 */
export function createAreaPath(
  linePath: string,
  width: number,
  height: number,
  dataLength: number
): string {
  if (!linePath) return '';
  const xStep = width / (dataLength - 1);
  const lastX = (dataLength - 1) * xStep;
  return `${linePath} L ${lastX} ${height} L 0 ${height} Z`;
}

/**
 * Hook to generate chart paths from price data
 */
export function useChartPath(
  data: number[],
  width: number,
  height: number,
  padding: number = 8
): ChartPathResult {
  return useMemo(() => {
    const { path, lastPoint } = createChartPath(data, width, height, padding);
    const areaPath = createAreaPath(path, width, height, data.length);
    return { linePath: path, areaPath, lastPoint };
  }, [data, width, height, padding]);
}

/**
 * Generates fallback chart data when historical data isn't available
 */
export function generateFallbackChartData(currentPrice: number, points: number = 50): number[] {
  const data: number[] = [];
  let value = currentPrice;

  for (let i = 0; i < points; i++) {
    value += (Math.random() - 0.48) * (currentPrice * 0.02);
    value = Math.max(currentPrice * 0.7, Math.min(currentPrice * 1.3, value));
    data.push(value);
  }

  // Ensure last point matches current price
  data[data.length - 1] = currentPrice;
  return data;
}
