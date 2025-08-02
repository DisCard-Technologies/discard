'use client';

/**
 * Cards dashboard page - lists all user cards with management actions
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { useCards, useUpdateCardStatus, useDeleteCard } from '../../../lib/hooks/useCards';
import { CardList } from '../../../components/cards/CardList';
import { CardDeletion } from '../../../../../../packages/shared/src/utils';
import { PlusIcon } from '../../../lib/stubs';
import { CardListRequest } from '../../../../../../packages/shared/src/types';

export default function CardsDashboard() {
  const [filters, setFilters] = useState<CardListRequest>({});
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string>('');

  // Fetch cards with current filters
  const { data: cards = [], isLoading, error, refetch } = useCards(filters);
  
  // Mutations
  const updateStatusMutation = useUpdateCardStatus();
  const deleteCardMutation = useDeleteCard();

  // Handle status change
  const handleStatusChange = async (cardId: string, status: 'active' | 'paused') => {
    try {
      await updateStatusMutation.mutateAsync({ cardId, status });
    } catch (error) {
      console.error('Failed to update card status:', error);
      // TODO: Show error toast
    }
  };

  // Handle delete confirmation
  const handleDeleteRequest = (cardId: string) => {
    const card = cards.find((c: any) => c.cardId === cardId);
    if (!card) return;

    setDeletingCardId(cardId);
    setDeleteConfirmation('');
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!deletingCardId) return;

    // Validate confirmation text
    if (!CardDeletion.validateUserInput(deleteConfirmation)) {
      alert('Please type "DELETE" to confirm card deletion.');
      return;
    }

    try {
      const result = await deleteCardMutation.mutateAsync(deletingCardId);
      
      // Verify deletion proof if provided
      if (result.deletionProof) {
        const proofValid = await CardDeletion.verifyProof(result.deletionProof, deletingCardId);
        if (!proofValid) {
          console.warn('Deletion proof verification failed');
        }
      }

      setDeletingCardId(null);
      setDeleteConfirmation('');
      
      // Refetch cards to update the list
      refetch();
    } catch (error) {
      console.error('Failed to delete card:', error);
      // TODO: Show error toast
    }
  };

  // Handle card details navigation
  const handleViewDetails = (cardId: string) => {
    window.location.href = `/dashboard/cards/${cardId}`;
  };

  // Calculate stats
  const stats = React.useMemo(() => {
    const active = cards.filter((card: any) => card.status === 'active').length;
    const paused = cards.filter((card: any) => card.status === 'paused').length;
    const totalBalance = cards.reduce((sum: number, card: any) => sum + card.currentBalance, 0);
    const totalLimit = cards.reduce((sum: number, card: any) => sum + card.spendingLimit, 0);

    return { active, paused, totalBalance, totalLimit };
  }, [cards]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h3 className="text-lg font-medium text-red-800">Error Loading Cards</h3>
            <p className="text-red-700 mt-1">
              {error instanceof Error ? error.message : 'Failed to load cards'}
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
            <h1 className="text-3xl font-bold text-gray-900">Virtual Cards</h1>
            <p className="mt-1 text-gray-600">
              Manage your disposable virtual cards with enhanced privacy protection.
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <Link
              href="/dashboard/cards/create"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Create New Card
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Active Cards</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.active}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-yellow-600 rounded-full"></div>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Paused Cards</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.paused}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Balance</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(stats.totalBalance)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Limit</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(stats.totalLimit)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Cards List */}
        <CardList
          cards={cards}
          isLoading={isLoading}
          onStatusChange={handleStatusChange}
          onDelete={handleDeleteRequest}
          onViewDetails={handleViewDetails}
          onFilterChange={setFilters}
        />

        {/* Delete Confirmation Modal */}
        {deletingCardId && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Confirm Card Deletion
                </h3>
                
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
                      setDeletingCardId(null);
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