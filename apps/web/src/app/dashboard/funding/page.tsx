'use client';

/**
 * Funding dashboard page - main funding interface with balance and quick actions
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useFunding } from '../../../lib/hooks/useFunding';
import { BalanceDisplay } from '../../../components/funding/BalanceDisplay';
import { FundingForm } from '../../../components/funding/FundingForm';
import { formatCurrency } from '@discard/shared/src/utils/funding';

export default function FundingDashboard() {
  const [showFundingForm, setShowFundingForm] = useState(false);
  const [fundingMode, setFundingMode] = useState<'fund' | 'allocate' | 'transfer'>('fund');

  const { 
    accountBalance, 
    recentTransactions, 
    isLoading, 
    error, 
    refetch 
  } = useFunding();

  const handleFundingSuccess = () => {
    setShowFundingForm(false);
    refetch();
  };

  const stats = React.useMemo(() => {
    const balance = accountBalance || { totalBalance: 0, availableBalance: 0, allocatedBalance: 0 };
    const allocationPercentage = balance.totalBalance > 0 
      ? (balance.allocatedBalance / balance.totalBalance) * 100 
      : 0;

    return {
      totalBalance: balance.totalBalance,
      availableBalance: balance.availableBalance,
      allocatedBalance: balance.allocatedBalance,
      allocationPercentage,
      recentTransactionCount: recentTransactions?.length || 0,
    };
  }, [accountBalance, recentTransactions]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h3 className="text-lg font-medium text-red-800">Error Loading Funding Data</h3>
            <p className="text-red-700 mt-1">
              {(error as any).message || 'Failed to load funding information'}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Funding</h1>
            <p className="mt-1 text-gray-600">
              Manage your account balance and fund your disposable cards.
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex space-x-3">
            <Link
              href="/dashboard/funding/balance"
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Balance Details
            </Link>
            <button
              onClick={() => {
                setFundingMode('fund');
                setShowFundingForm(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              💳 Fund Account
            </button>
          </div>
        </div>

        {/* Balance Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <BalanceDisplay
              accountBalance={accountBalance}
              isLoading={isLoading}
              onRefresh={refetch}
            />
          </div>
          
          {/* Quick Stats */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Stats</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Allocation Rate</span>
                  <span className="text-sm font-medium text-gray-900">
                    {stats.allocationPercentage.toFixed(1)}%
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Recent Transactions</span>
                  <span className="text-sm font-medium text-gray-900">
                    {stats.recentTransactionCount}
                  </span>
                </div>
                
                <div className="pt-2 border-t border-gray-200">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full" 
                      style={{ width: `${Math.min(stats.allocationPercentage, 100)}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-center">
                    Funds allocated to cards
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => {
                setFundingMode('fund');
                setShowFundingForm(true);
              }}
              className="flex items-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">💳</span>
              </div>
              <div className="ml-4 text-left">
                <h4 className="font-medium text-gray-900">Fund Account</h4>
                <p className="text-sm text-gray-600">Add money from bank or card</p>
              </div>
            </button>

            <Link
              href="/dashboard/funding/allocate"
              className="flex items-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">📤</span>
              </div>
              <div className="ml-4 text-left">
                <h4 className="font-medium text-gray-900">Allocate to Card</h4>
                <p className="text-sm text-gray-600">Move funds to a specific card</p>
              </div>
            </Link>

            <Link
              href="/dashboard/funding/transfer"
              className="flex items-center p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">🔄</span>
              </div>
              <div className="ml-4 text-left">
                <h4 className="font-medium text-gray-900">Transfer Between Cards</h4>
                <p className="text-sm text-gray-600">Move money between cards</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
            <Link
              href="/dashboard/funding/transactions"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View All
            </Link>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : recentTransactions && recentTransactions.length > 0 ? (
            <div className="space-y-3">
              {recentTransactions.slice(0, 5).map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-sm">
                        {transaction.type === 'account_funding' ? '💳' :
                         transaction.type === 'card_allocation' ? '📤' : '🔄'}
                      </span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">
                        {transaction.type === 'account_funding' ? 'Account Funding' :
                         transaction.type === 'card_allocation' ? 'Card Allocation' :
                         'Card Transfer'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${
                      transaction.type === 'account_funding' ? 'text-green-600' : 'text-gray-900'
                    }`}>
                      {transaction.type === 'account_funding' ? '+' : ''}
                      {formatCurrency(transaction.amount)}
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      transaction.status === 'completed' ? 'bg-green-100 text-green-800' :
                      transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      transaction.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {transaction.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📊</span>
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">No transactions yet</h4>
              <p className="text-gray-600 mb-4">Start by funding your account to see transactions here.</p>
              <button
                onClick={() => {
                  setFundingMode('fund');
                  setShowFundingForm(true);
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Fund Account
              </button>
            </div>
          )}
        </div>

        {/* Funding Form Modal */}
        {showFundingForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border max-w-md shadow-lg rounded-md bg-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {fundingMode === 'fund' ? 'Fund Account' :
                   fundingMode === 'allocate' ? 'Allocate to Card' : 'Transfer Between Cards'}
                </h3>
                <button
                  onClick={() => setShowFundingForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <FundingForm
                mode={fundingMode}
                onSuccess={handleFundingSuccess}
                onCancel={() => setShowFundingForm(false)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}