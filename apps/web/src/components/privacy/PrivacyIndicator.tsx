/**
 * Privacy indicator component for card privacy status visualization
 */

import React from 'react';
import { ShieldCheckIcon, ShieldExclamationIcon, EyeSlashIcon } from '../../lib/stubs';

export interface PrivacyStatus {
  encrypted: boolean;
  isolated: boolean;
  deletable: boolean;
  level: 'high' | 'medium' | 'low';
}

interface PrivacyIndicatorProps {
  status: PrivacyStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function PrivacyIndicator({ status, size = 'md', showLabel = true, className = '' }: PrivacyIndicatorProps) {
  const getPrivacyIcon = () => {
    if (status.level === 'high') {
      return <ShieldCheckIcon className="text-green-600" />;
    } else if (status.level === 'medium') {
      return <ShieldExclamationIcon className="text-yellow-600" />;
    } else {
      return <EyeSlashIcon className="text-red-600" />;
    }
  };

  const getPrivacyColor = () => {
    switch (status.level) {
      case 'high':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'w-4 h-4';
      case 'md':
        return 'w-5 h-5';
      case 'lg':
        return 'w-6 h-6';
    }
  };

  const getPrivacyLabel = () => {
    switch (status.level) {
      case 'high':
        return 'High Privacy';
      case 'medium':
        return 'Medium Privacy';
      case 'low':
        return 'Low Privacy';
    }
  };

  const getPrivacyDescription = () => {
    const features = [];
    if (status.encrypted) features.push('Encrypted');
    if (status.isolated) features.push('Isolated');
    if (status.deletable) features.push('Deletable');
    return features.join(' • ');
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`${getSizeClasses()}`}>
        {getPrivacyIcon()}
      </div>
      {showLabel && (
        <div className="flex flex-col">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getPrivacyColor()}`}>
            {getPrivacyLabel()}
          </span>
          {size !== 'sm' && (
            <span className="text-xs text-gray-500 mt-1">
              {getPrivacyDescription()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Utility function to determine privacy status based on card properties
export function getPrivacyStatus(card: any): PrivacyStatus {
  // In a real implementation, this would check actual card privacy properties
  // For now, we'll assume high privacy for active cards with proper setup
  const encrypted = true; // All cards are encrypted
  const isolated = true; // All cards use privacy isolation
  const deletable = card.status !== 'deleted'; // Only non-deleted cards are deletable
  
  let level: 'high' | 'medium' | 'low' = 'high';
  
  if (!encrypted || !isolated) {
    level = 'low';
  } else if (!deletable) {
    level = 'medium';
  }

  return {
    encrypted,
    isolated,
    deletable,
    level,
  };
}