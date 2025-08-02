'use client';

/**
 * Card details page - shows detailed information about a specific card
 */

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCardDetails, useUpdateCardStatus, useDeleteCard } from '../../../../lib/hooks/useCards';
import { CardComponent } from '../../../../components/cards/CardComponent';
import { PrivacyIndicator, getPrivacyStatus } from '../../../../components/privacy/PrivacyIndicator';
import { CardDeletion } from '../../../../../../packages/shared/src/utils';
import { 
  ArrowLeftIcon, 
  ClockIcon, 
  CreditCardIcon, 
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from '../../../../lib/stubs';
import Link from 'next/link';

export default function CardDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // Fetch card details
  const { data: cardData, isLoading, error, refetch } = useCardDetails(cardId);
  const updateStatusMutation = useUpdateCardStatus();
  const deleteCardMutation = useDeleteCard();

  // Handle status change
  const handleStatusChange = async (cardId: string, status: 'active' | 'paused') => {
    try {
      await updateStatusMutation.mutateAsync({ cardId, status });
    } catch (error) {
      console.error('Failed to update card status:', error);
    }
  };

  // Handle delete request
  const handleDeleteRequest = () => {
    setShowDeleteModal(true);
    setDeleteConfirmation('');
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!CardDeletion.validateUserInput(deleteConfirmation)) {
      alert('Please type "DELETE" to confirm card deletion.');
      return;
    }

    try {
      const result = await deleteCardMutation.mutateAsync(cardId);
      
      // Verify deletion proof if provided
      if (result.deletionProof) {
        const proofValid = await CardDeletion.verifyProof(result.deletionProof, cardId);
        if (!proofValid) {
          console.warn('Deletion proof verification failed');
        }
      }

      // Redirect to dashboard after successful deletion
      router.push('/dashboard/cards');
    } catch (error) {
      console.error('Failed to delete card:', error);
      setShowDeleteModal(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-32 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded w-64 mb-8"></div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !cardData) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard/cards"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Back to Cards
          </Link>
          
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h3 className="text-lg font-medium text-red-800">Error Loading Card</h3>
            <p className="text-red-700 mt-1">
              {error instanceof Error ? error.message : 'Card not found or access denied'}
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

  const { card, transactionHistory } = cardData;
  const privacyStatus = getPrivacyStatus(card);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/cards"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Back to Cards
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Card Details</h1>
              <p className="mt-1 text-gray-600">
                Virtual Card ending in {card.cardId.slice(-4)}
              </p>
            </div>
            <PrivacyIndicator status={privacyStatus} size="lg" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Card Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card Display */}
            <CardComponent
              card={card}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteRequest}
            />

            {/* Transaction History */}
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Transaction History</h3>
              </div>
              <div className="p-6">
                {transactionHistory && transactionHistory.length > 0 ? (
                  <div className="space-y-4">
                    {transactionHistory.map((transaction: any) => (
                      <div key={transaction.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            transaction.status === 'completed' ? 'bg-green-100' :
                            transaction.status === 'pending' ? 'bg-yellow-100' : 'bg-red-100'
                          }`}>
                            <CreditCardIcon className={`w-5 h-5 ${
                              transaction.status === 'completed' ? 'text-green-600' :
                              transaction.status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                            }`} />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{transaction.merchant}</p>
                            <p className="text-sm text-gray-500">
                              {formatDate(transaction.timestamp)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            {formatCurrency(transaction.amount)}
                          </p>
                          <p className={`text-sm capitalize ${
                            transaction.status === 'completed' ? 'text-green-600' :
                            transaction.status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {transaction.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CreditCardIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-900 mb-2">No Transactions Yet</h4>
                    <p className="text-gray-500">
                      This card hasn't been used for any transactions.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Card Information */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Card Information</h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Card ID</dt>
                  <dd className="text-sm text-gray-900 font-mono">{card.cardId}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="text-sm">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      card.status === 'active' ? 'bg-green-100 text-green-800' :
                      card.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {card.status.charAt(0).toUpperCase() + card.status.slice(1)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="text-sm text-gray-900">{formatDate(card.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Expires</dt>
                  <dd className="text-sm text-gray-900">{formatDate(card.expiresAt)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Current Balance</dt>
                  <dd className="text-sm text-gray-900 font-semibold">
                    {formatCurrency(card.currentBalance)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Spending Limit</dt>
                  <dd className="text-sm text-gray-900 font-semibold">
                    {formatCurrency(card.spendingLimit)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Merchant Restrictions */}
            {card.merchantRestrictions && card.merchantRestrictions.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Merchant Restrictions</h3>
                <div className="space-y-2">
                  {card.merchantRestrictions.map((restriction: any, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2 mb-2"
                    >
                      {restriction}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  This card can only be used at merchants in these categories.
                </p>
              </div>
            )}

            {/* Privacy & Security */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center mb-4">
                <ShieldCheckIcon className="w-5 h-5 text-green-600 mr-2" />
                <h3 className="text-lg font-medium text-gray-900">Privacy & Security</h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                  <span className="text-sm text-gray-600">End-to-end encryption</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                  <span className="text-sm text-gray-600">Privacy isolation enabled</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                  <span className="text-sm text-gray-600">Cryptographic deletion</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                  <span className="text-sm text-gray-600">Secure key management</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center mb-4">
                  <ExclamationTriangleIcon className="w-6 h-6 text-red-600 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">
                    Confirm Card Deletion
                  </h3>
                </div>
                
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-red-800">
                    ⚠️ This action cannot be undone. The card will be permanently deleted 
                    and all associated data will be cryptographically destroyed.
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type "DELETE" to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    placeholder="DELETE"
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteConfirmation('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={deleteCardMutation.isLoading || deleteConfirmation !== 'DELETE'}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleteCardMutation.isLoading ? 'Deleting...' : 'Delete Card'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}