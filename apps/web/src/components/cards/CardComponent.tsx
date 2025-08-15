/**
 * Card component for displaying card information with privacy indicators
 */

import React, { useState } from 'react';
import { Card } from '@discard/shared';
import { CardClipboard } from '../../../../../packages/shared/src/utils/index';
import { PrivacyIndicator, getPrivacyStatus } from '../privacy/PrivacyIndicator';
import { 
  CreditCardIcon, 
  EyeIcon, 
  EyeSlashIcon, 
  ClipboardDocumentIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from '../../lib/stubs';

interface CardComponentProps {
  card: Card;
  showSensitiveData?: boolean;
  onStatusChange?: (cardId: string, status: 'active' | 'paused') => void;
  onDelete?: (cardId: string) => void;
  onViewDetails?: (cardId: string) => void;
  cardNumber?: string;
  cvv?: string;
  className?: string;
}

export function CardComponent({
  card,
  showSensitiveData = false,
  onStatusChange,
  onDelete,
  onViewDetails,
  cardNumber,
  cvv,
  className = '',
}: CardComponentProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const privacyStatus = getPrivacyStatus(card);

  const handleCopyCardNumber = async () => {
    if (!cardNumber) return;
    
    const result = await CardClipboard.copyCardNumber(cardNumber, {
      onCleared: () => setCopyFeedback(null),
      onError: (error: any) => setCopyFeedback(`Error: ${error.message}`),
    });

    if (result.success) {
      setCopyFeedback('Card number copied! Will clear in 30 seconds.');
    } else {
      setCopyFeedback(result.message);
    }

    // Clear feedback after 3 seconds
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  const handleCopyCVV = async () => {
    if (!cvv) return;
    
    const result = await CardClipboard.copyCVV(cvv, {
      onCleared: () => setCopyFeedback(null),
      onError: (error: any) => setCopyFeedback(`Error: ${error.message}`),
    });

    if (result.success) {
      setCopyFeedback('CVV copied! Will clear in 15 seconds.');
    } else {
      setCopyFeedback(result.message);
    }

    // Clear feedback after 3 seconds
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  const getStatusColor = () => {
    switch (card.status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'deleted':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatCardNumber = (number: string) => {
    if (!isRevealed) {
      return `**** **** **** ${number.slice(-4)}`;
    }
    return number.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <CreditCardIcon className="w-6 h-6 text-gray-400" />
            <span className="font-medium text-gray-900">Virtual Card</span>
          </div>
          <div className="flex items-center space-x-2">
            <PrivacyIndicator status={privacyStatus} size="sm" />
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor()}`}>
              {card.status.charAt(0).toUpperCase() + card.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Card Number */}
        {showSensitiveData && cardNumber && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Card Number</span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setIsRevealed(!isRevealed)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title={isRevealed ? 'Hide card number' : 'Show card number'}
                >
                  {isRevealed ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleCopyCardNumber}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title="Copy card number"
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="font-mono text-lg tracking-wider text-gray-900">
              {formatCardNumber(cardNumber)}
            </div>
          </div>
        )}

        {/* CVV and Expiration */}
        {showSensitiveData && cvv && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="text-sm font-medium text-gray-700">CVV</span>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-lg">
                  {isRevealed ? cvv : '***'}
                </span>
                <button
                  onClick={handleCopyCVV}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title="Copy CVV"
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700">Expires</span>
              <div className="font-mono text-lg">
                {new Date(card.expiresAt).toLocaleDateString('en-US', { 
                  month: '2-digit', 
                  year: '2-digit' 
                })}
              </div>
            </div>
          </div>
        )}

        {/* Balance and Limit */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <span className="text-sm font-medium text-gray-700">Current Balance</span>
            <div className="text-lg font-semibold text-green-600">
              {formatCurrency(card.currentBalance)}
            </div>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Spending Limit</span>
            <div className="text-lg font-semibold text-gray-900">
              {formatCurrency(card.spendingLimit)}
            </div>
          </div>
        </div>

        {/* Copy Feedback */}
        {copyFeedback && (
          <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">{copyFeedback}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-2">
            {onStatusChange && card.status !== 'deleted' && (
              <button
                onClick={() => onStatusChange(card.cardId, card.status === 'active' ? 'paused' : 'active')}
                className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {card.status === 'active' ? (
                  <>
                    <PauseIcon className="w-4 h-4 mr-1" />
                    Pause
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-4 h-4 mr-1" />
                    Activate
                  </>
                )}
              </button>
            )}
            {onDelete && card.status !== 'deleted' && (
              <button
                onClick={() => onDelete(card.cardId)}
                className="inline-flex items-center px-3 py-1 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <TrashIcon className="w-4 h-4 mr-1" />
                Delete
              </button>
            )}
          </div>
          {onViewDetails && (
            <button
              onClick={() => onViewDetails(card.cardId)}
              className="text-sm text-indigo-600 hover:text-indigo-900"
            >
              View Details →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}