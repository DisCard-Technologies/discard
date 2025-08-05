'use client';

/**
 * Balance Display Component for Web
 * Shows detailed account balance information with visual indicators
 */

import React from 'react';
import { formatCurrency } from '@discard/shared/src/utils/funding';
import { AccountBalance } from '@discard/shared';

interface BalanceDisplayProps {
  accountBalance?: AccountBalance | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  showDetails?: boolean;
}

export function BalanceDisplay({ 
  accountBalance, 
  isLoading = false, 
  onRefresh,
  showDetails = true 
}: BalanceDisplayProps) {
  if (isLoading && !accountBalance) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-6"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!accountBalance) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">💰</span>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Balance Data</h3>
          <p className="text-gray-600 mb-4">Unable to load account balance information</p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  const allocationPercentage = accountBalance.totalBalance > 0 
    ? (accountBalance.allocatedBalance / accountBalance.totalBalance) * 100 
    : 0;

  const isLowBalance = accountBalance.availableBalance < 1000; // $10.00 threshold

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">Account Balance</h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            title="Refresh balance"
          >
            <svg 
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>

      {/* Total Balance */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center">
          <span className="text-3xl font-bold text-green-600">
            {formatCurrency(accountBalance.totalBalance)}
          </span>
          {isLowBalance && (
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              ⚠️ Low Balance
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-1">Total Account Balance</p>
      </div>

      {showDetails && (
        <>
          {/* Balance Breakdown */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-xl font-semibold text-green-600">
                {formatCurrency(accountBalance.availableBalance)}
              </div>
              <div className="text-sm text-green-700">Available</div>
              <div className="text-xs text-green-600 mt-1">Ready for allocation</div>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-xl font-semibold text-blue-600">
                {formatCurrency(accountBalance.allocatedBalance)}
              </div>
              <div className="text-sm text-blue-700">Allocated</div>
              <div className="text-xs text-blue-600 mt-1">On cards</div>
            </div>
          </div>

          {/* Allocation Progress */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Allocation Progress</span>
              <span className="text-sm text-gray-600">{allocationPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(allocationPercentage, 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Last Updated */}
          <div className="text-center">
            <p className="text-xs text-gray-500">
              Last updated: {new Date(accountBalance.lastUpdated).toLocaleString()}
            </p>
          </div>

          {/* Low Balance Warning */}
          {isLowBalance && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-yellow-800">Low Balance Alert</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    Consider adding funds to your account. Available balance is below $10.00.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}