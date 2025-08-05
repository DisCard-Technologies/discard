'use client';

/**
 * Allocation Manager Component for Web
 * Manages fund allocation to cards with card selection and real-time updates
 */

import React, { useState } from 'react';
import { useCards } from '../../lib/hooks/useCards';
import { useAccountBalance, useAllocateToCard } from '../../lib/hooks/useFunding';
import { FundingForm } from './FundingForm';
import { formatCurrency } from '@discard/shared/src/utils/funding';

interface AllocationManagerProps {
  preselectedCardId?: string;
  onSuccess?: (transactionId: string) => void;
  onCancel?: () => void;
}

export function AllocationManager({ 
  preselectedCardId, 
  onSuccess, 
  onCancel 
}: AllocationManagerProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(preselectedCardId || null);
  const [showAllocationForm, setShowAllocationForm] = useState(!!preselectedCardId);

  const { data: cards = [], isLoading: isLoadingCards } = useCards({ status: 'active' });
  const { data: balanceData, isLoading: isLoadingBalance } = useAccountBalance();
  const allocateToCardMutation = useAllocateToCard();

  const accountBalance = balanceData?.balance;
  const availableBalance = accountBalance?.availableBalance || 0;

  const handleCardSelect = (cardId: string) => {
    setSelectedCardId(cardId);
    setShowAllocationForm(true);
  };

  const handleAllocationSuccess = (transactionId: string) => {
    setShowAllocationForm(false);
    setSelectedCardId(null);
    onSuccess?.(transactionId);
  };

  const handleBack = () => {
    if (showAllocationForm) {
      setShowAllocationForm(false);
      if (!preselectedCardId) {
        setSelectedCardId(null);
      }
    } else {
      onCancel?.();
    }
  };

  // Show allocation form if card is selected
  if (showAllocationForm && selectedCardId) {
    const selectedCard = cards.find(card => card.cardId === selectedCardId);
    if (!selectedCard) {
      setShowAllocationForm(false);
      setSelectedCardId(null);
      return null;
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            ← Back
          </button>
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Allocate to Card ••••{selectedCard.cardId.slice(-4)}
            </h3>
            <p className="text-sm text-gray-600">
              Current balance: {formatCurrency(selectedCard.currentBalance)} | 
              Limit: {formatCurrency(selectedCard.spendingLimit)}
            </p>
          </div>
        </div>

        <FundingForm
          mode="allocate"
          cardId={selectedCardId}
          onSuccess={handleAllocationSuccess}
          onCancel={handleBack}
          availableBalance={availableBalance}
        />
      </div>
    );
  }

  // Show loading state
  if (isLoadingCards || isLoadingBalance) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show no available balance warning
  if (availableBalance <= 0) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Available Balance</h3>
        <p className="text-gray-600 mb-4">
          You need to fund your account before allocating to cards.
        </p>
        <button
          onClick={onCancel}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Fund Account
        </button>
      </div>
    );
  }

  // Show no active cards message
  if (cards.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">💳</span>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Cards</h3>
        <p className="text-gray-600 mb-4">
          Create an active card to allocate funds to it.
        </p>
        <button
          onClick={onCancel}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Create Card
        </button>
      </div>
    );
  }

  // Show card selection
  return (
    <div className="space-y-6">
      {/* Available Balance */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <span className="text-2xl">💰</span>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-medium text-blue-800">Available for Allocation</h4>
            <p className="text-lg font-semibold text-blue-900">
              {formatCurrency(availableBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Card Selection */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Select Card to Fund</h3>
        <div className="space-y-3">
          {cards.map((card) => {
            const isLowBalance = card.currentBalance < 500; // $5.00 threshold
            const utilizationPercentage = (card.currentBalance / card.spendingLimit) * 100;

            return (
              <div
                key={card.cardId}
                className="relative bg-white border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
                onClick={() => handleCardSelect(card.cardId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <span className="text-lg">💳</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          Card ••••{card.cardId.slice(-4)}
                        </h4>
                        <p className="text-xs text-gray-600">
                          Limit: {formatCurrency(card.spendingLimit)}
                        </p>
                      </div>
                    </div>

                    {/* Utilization Bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Balance: {formatCurrency(card.currentBalance)}</span>
                        <span>{utilizationPercentage.toFixed(1)}% utilized</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            utilizationPercentage > 90 ? 'bg-red-500' :
                            utilizationPercentage > 70 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0 ml-4">
                    {isLowBalance && (
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 mb-2">
                        ⚠️ Low Balance
                      </div>
                    )}
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {isLowBalance && (
                  <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-xs text-yellow-800">
                      💡 This card has a low balance. Consider adding funds.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}