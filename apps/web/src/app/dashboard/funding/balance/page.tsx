'use client';

/**
 * Balance detail page - detailed balance management and notification settings
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useAccountBalance, useUpdateNotificationThresholds } from '../../../../lib/hooks/useFunding';
import { BalanceDisplay } from '../../../../components/funding/BalanceDisplay';
import { formatCurrency } from '@discard/shared/src/utils/funding';

export default function BalanceDetailPage() {
  const { data: balanceData, isLoading, error, refetch } = useAccountBalance();
  const updateThresholdsMutation = useUpdateNotificationThresholds();

  const [isEditingThresholds, setIsEditingThresholds] = useState(false);
  const [accountThreshold, setAccountThreshold] = useState('');
  const [cardThreshold, setCardThreshold] = useState('');
  const [enableNotifications, setEnableNotifications] = useState(true);

  const accountBalance = balanceData?.balance;
  const notificationThresholds = balanceData?.notificationThresholds;

  // Initialize form when data loads
  React.useEffect(() => {
    if (notificationThresholds && !isEditingThresholds) {
      setAccountThreshold((notificationThresholds.accountThreshold / 100).toString());
      setCardThreshold((notificationThresholds.cardThreshold / 100).toString());
      setEnableNotifications(notificationThresholds.enableNotifications);
    }
  }, [notificationThresholds, isEditingThresholds]);

  const handleSaveThresholds = async () => {
    try {
      const accountThresholdCents = Math.round(parseFloat(accountThreshold) * 100);
      const cardThresholdCents = Math.round(parseFloat(cardThreshold) * 100);

      if (isNaN(accountThresholdCents) || isNaN(cardThresholdCents)) {
        alert('Please enter valid threshold amounts');
        return;
      }

      await updateThresholdsMutation.mutateAsync({
        accountThreshold: accountThresholdCents,
        cardThreshold: cardThresholdCents,
        enableNotifications,
      });

      setIsEditingThresholds(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update thresholds:', error);
      alert('Failed to update notification thresholds');
    }
  };

  const handleCancelEdit = () => {
    setIsEditingThresholds(false);
    if (notificationThresholds) {
      setAccountThreshold((notificationThresholds.accountThreshold / 100).toString());
      setCardThreshold((notificationThresholds.cardThreshold / 100).toString());
      setEnableNotifications(notificationThresholds.enableNotifications);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h3 className="text-lg font-medium text-red-800">Error Loading Balance Data</h3>
            <p className="text-red-700 mt-1">
              {(error as any).message || 'Failed to load balance information'}
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-8">
          <Link
            href="/dashboard/funding"
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            ← Back to Funding
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Balance Management</h1>
            <p className="mt-1 text-gray-600">
              Monitor and configure your account balance and notifications.
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {/* Balance Overview */}
          <BalanceDisplay
            accountBalance={accountBalance}
            isLoading={isLoading}
            onRefresh={refetch}
            showDetails={true}
          />

          {/* Balance Breakdown */}
          {accountBalance && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-6">Detailed Breakdown</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Total Balance */}
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 mb-2">
                    {formatCurrency(accountBalance.totalBalance)}
                  </div>
                  <div className="text-sm text-green-700 font-medium">Total Balance</div>
                  <div className="text-xs text-green-600 mt-1">
                    All funds in your account
                  </div>
                </div>

                {/* Available Balance */}
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600 mb-2">
                    {formatCurrency(accountBalance.availableBalance)}
                  </div>
                  <div className="text-sm text-blue-700 font-medium">Available</div>
                  <div className="text-xs text-blue-600 mt-1">
                    Ready for allocation
                  </div>
                </div>

                {/* Allocated Balance */}
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600 mb-2">
                    {formatCurrency(accountBalance.allocatedBalance)}
                  </div>
                  <div className="text-sm text-purple-700 font-medium">Allocated</div>
                  <div className="text-xs text-purple-600 mt-1">
                    Currently on cards
                  </div>
                </div>
              </div>

              {/* Allocation Progress */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Allocation Progress</span>
                  <span className="text-sm text-gray-600">
                    {accountBalance.totalBalance > 0 
                      ? ((accountBalance.allocatedBalance / accountBalance.totalBalance) * 100).toFixed(1)
                      : 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-purple-600 h-3 rounded-full transition-all duration-300" 
                    style={{ 
                      width: `${accountBalance.totalBalance > 0 
                        ? Math.min((accountBalance.allocatedBalance / accountBalance.totalBalance) * 100, 100)
                        : 0}%` 
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          )}

          {/* Notification Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-gray-900">Notification Settings</h3>
              <button
                onClick={() => {
                  if (isEditingThresholds) {
                    handleSaveThresholds();
                  } else {
                    setIsEditingThresholds(true);
                  }
                }}
                disabled={updateThresholdsMutation.isPending}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {updateThresholdsMutation.isPending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : isEditingThresholds ? (
                  'Save Changes'
                ) : (
                  'Edit Settings'
                )}
              </button>
            </div>

            {isLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-16 bg-gray-200 rounded"></div>
                <div className="h-16 bg-gray-200 rounded"></div>
                <div className="h-16 bg-gray-200 rounded"></div>
              </div>
            ) : notificationThresholds ? (
              <div className="space-y-6">
                {/* Enable Notifications */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Low Balance Notifications</h4>
                    <p className="text-sm text-gray-600">Get notified when balances fall below thresholds</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableNotifications}
                      onChange={(e) => setEnableNotifications(e.target.checked)}
                      disabled={!isEditingThresholds}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="border-t border-gray-200"></div>

                {/* Account Threshold */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">Account Threshold</h4>
                    <p className="text-sm text-gray-600">Notify when available balance is below this amount</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">$</span>
                    {isEditingThresholds ? (
                      <input
                        type="text"
                        value={accountThreshold}
                        onChange={(e) => setAccountThreshold(e.target.value)}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="0.00"
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-900">
                        {(notificationThresholds.accountThreshold / 100).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-200"></div>

                {/* Card Threshold */}
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">Card Threshold</h4>
                    <p className="text-sm text-gray-600">Notify when individual card balance is below this amount</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">$</span>
                    {isEditingThresholds ? (
                      <input
                        type="text"
                        value={cardThreshold}
                        onChange={(e) => setCardThreshold(e.target.value)}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="0.00"
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-900">
                        {(notificationThresholds.cardThreshold / 100).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-200"></div>

                {/* Notification Methods */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Notification Methods</h4>
                    <p className="text-sm text-gray-600">
                      {notificationThresholds.notificationMethods.join(', ')}
                    </p>
                  </div>
                </div>

                {/* Cancel button when editing */}
                {isEditingThresholds && (
                  <div className="pt-4 border-t border-gray-200">
                    <button
                      onClick={handleCancelEdit}
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel Changes
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600">No notification settings available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}