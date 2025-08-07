/**
 * Format currency values with proper USD display
 */
export const formatCurrency = (value: string | number, decimals: number = 2): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return '$0.00';
  
  // Handle very large numbers
  if (numValue >= 1000000000) {
    return `$${(numValue / 1000000000).toFixed(1)}B`;
  }
  if (numValue >= 1000000) {
    return `$${(numValue / 1000000).toFixed(1)}M`;
  }
  if (numValue >= 1000) {
    return `$${(numValue / 1000).toFixed(1)}K`;
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(numValue);
};

/**
 * Format percentage values with proper display
 */
export const formatPercentage = (value: string | number, decimals: number = 2): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return '0.00';
  
  return numValue.toFixed(decimals);
};

/**
 * Format crypto amounts with appropriate precision
 */
export const formatCrypto = (value: string | number, symbol: string, decimals: number = 6): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return `0 ${symbol}`;
  
  // Use appropriate decimals based on value size
  let displayDecimals = decimals;
  if (numValue >= 1000) displayDecimals = 2;
  else if (numValue >= 1) displayDecimals = 4;
  
  return `${numValue.toFixed(displayDecimals)} ${symbol}`;
};

/**
 * Format large numbers with K/M/B suffixes
 */
export const formatNumber = (value: string | number, decimals: number = 1): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return '0';
  
  if (numValue >= 1000000000) {
    return `${(numValue / 1000000000).toFixed(decimals)}B`;
  }
  if (numValue >= 1000000) {
    return `${(numValue / 1000000).toFixed(decimals)}M`;
  }
  if (numValue >= 1000) {
    return `${(numValue / 1000).toFixed(decimals)}K`;
  }
  
  return numValue.toFixed(decimals);
};

/**
 * Format time duration in human readable format
 */
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  if (days < 7) {
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
};

/**
 * Format gas price in gwei
 */
export const formatGasPrice = (wei: string | number): string => {
  const weiValue = typeof wei === 'string' ? parseFloat(wei) : wei;
  const gwei = weiValue / 1000000000; // Convert wei to gwei
  
  return `${gwei.toFixed(2)} gwei`;
};

/**
 * Format wallet address with ellipsis
 */
export const formatAddress = (address: string, startChars: number = 6, endChars: number = 4): string => {
  if (!address || address.length <= startChars + endChars) {
    return address;
  }
  
  return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
};

/**
 * Format transaction hash with ellipsis
 */
export const formatTxHash = (hash: string): string => {
  return formatAddress(hash, 8, 6);
};