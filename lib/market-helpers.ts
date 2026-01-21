/**
 * Market Helper Utilities
 *
 * Utility functions for prediction market display and formatting
 */

import type { PredictionMarket, MarketOutcome } from '@/types/holdings.types';

/**
 * Convert binary yes/no market to outcomes array
 * Extensible for future multi-outcome support
 */
export function marketToOutcomes(market: PredictionMarket): MarketOutcome[] {
  // If market already has outcomes defined, use those
  if (market.outcomes && market.outcomes.length > 0) {
    return market.outcomes;
  }

  // Default: convert binary yes/no to outcomes
  return [
    {
      id: 'yes',
      label: 'Yes',
      probability: market.yesPrice,
      icon: 'checkmark',
      color: '#10B981', // green
    },
    {
      id: 'no',
      label: 'No',
      probability: market.noPrice,
      icon: 'close',
      color: '#EF4444', // red
    },
  ];
}

/**
 * Format volume as abbreviated string
 * e.g., 2000000 -> "$2M", 307000 -> "$307K"
 */
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `$${(volume / 1_000_000_000).toFixed(1)}B`;
  }
  if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(volume >= 10_000_000 ? 0 : 1)}M`;
  }
  if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(0)}K`;
  }
  return `$${volume.toFixed(0)}`;
}

/**
 * Format market end date
 * Returns "On Jan 20, 2026" for future dates or "2h remaining" for near-term
 */
export function formatMarketEndDate(dateStr: string): string {
  const endDate = new Date(dateStr);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();

  // If already passed
  if (diffMs < 0) {
    return 'Ended';
  }

  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  // Less than 24 hours - show hours remaining
  if (diffHours < 24) {
    const hours = Math.ceil(diffHours);
    return `${hours}h remaining`;
  }

  // Less than 7 days - show days remaining
  if (diffDays < 7) {
    const days = Math.ceil(diffDays);
    return `${days}d remaining`;
  }

  // Otherwise show formatted date
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  return `On ${endDate.toLocaleDateString('en-US', options)}`;
}

/**
 * Get the leading outcome (highest probability)
 */
export function getLeadingOutcome(outcomes: MarketOutcome[]): MarketOutcome | null {
  if (!outcomes || outcomes.length === 0) return null;

  return outcomes.reduce((max, outcome) =>
    outcome.probability > max.probability ? outcome : max
  );
}

/**
 * Determine if market should show LIVE badge
 * Market is live if it's open and end date is within 7 days
 */
export function isMarketLive(market: PredictionMarket): boolean {
  if (market.status !== 'open') return false;

  // Check if explicitly marked as live
  if (market.isLive !== undefined) return market.isLive;

  // Auto-detect: live if ending within 7 days
  const endDate = new Date(market.endDate);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays > 0 && diffDays <= 7;
}

/**
 * Format probability as percentage string
 * e.g., 0.75 -> "75%"
 */
export function formatProbability(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

/**
 * Get category display label
 */
export function getCategoryLabel(category: string): string {
  const categoryMap: Record<string, string> = {
    politics: 'Politics',
    crypto: 'Crypto',
    sports: 'Sports',
    entertainment: 'Entertainment',
    economics: 'Economics',
    technology: 'Tech',
    science: 'Science',
    other: 'Other',
  };

  return categoryMap[category.toLowerCase()] || category;
}
