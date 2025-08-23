/**
 * Card list component for displaying multiple cards with filtering and sorting
 */

import React, { useState } from 'react';
import { Card, CardListRequest } from '@discard/shared';
import { CardComponent } from './CardComponent';
import { MagnifyingGlassIcon, FunnelIcon } from '../../lib/stubs';

interface CardListProps {
  cards: Card[];
  isLoading?: boolean;
  // eslint-disable-next-line no-unused-vars
  onStatusChange?: (cardId: string, status: 'active' | 'paused') => void;
  // eslint-disable-next-line no-unused-vars
  onDelete?: (cardId: string) => void;
  // eslint-disable-next-line no-unused-vars
  onViewDetails?: (cardId: string) => void;
  // eslint-disable-next-line no-unused-vars
  onFilterChange?: (filters: CardListRequest) => void;
}

export function CardList({
  cards,
  isLoading = false,
  onStatusChange,
  onDelete,
  onViewDetails,
  onFilterChange,
}: CardListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'deleted'>('all');
  const [sortBy, setSortBy] = useState<'created' | 'balance' | 'limit'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter and sort cards
  const filteredAndSortedCards = React.useMemo(() => {
    let filtered = cards;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(card => card.status === statusFilter);
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(card =>
        card.cardId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        card.userId.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'created':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'balance':
          comparison = a.currentBalance - b.currentBalance;
          break;
        case 'limit':
          comparison = a.spendingLimit - b.spendingLimit;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [cards, searchTerm, statusFilter, sortBy, sortOrder]);

  // Handle filter changes
  React.useEffect(() => {
    if (onFilterChange) {
      const filters: CardListRequest = {};
      if (statusFilter !== 'all') {
        filters.status = statusFilter as 'active' | 'paused' | 'deleted';
      }
      onFilterChange(filters);
    }
  }, [statusFilter, onFilterChange]);

  const getStatusCount = (status: 'active' | 'paused' | 'deleted') => {
    return cards.filter(card => card.status === status).length;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 bg-gray-200 rounded w-32"></div>
                <div className="h-6 bg-gray-200 rounded w-20"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          {/* Search */}
          <div className="relative max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search cards..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FunnelIcon className="h-5 w-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Cards ({cards.length})</option>
                <option value="active">Active ({getStatusCount('active')})</option>
                <option value="paused">Paused ({getStatusCount('paused')})</option>
                <option value="deleted">Deleted ({getStatusCount('deleted')})</option>
              </select>
            </div>

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field as any);
                setSortOrder(order as any);
              }}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="created-desc">Newest First</option>
              <option value="created-asc">Oldest First</option>
              <option value="balance-desc">Highest Balance</option>
              <option value="balance-asc">Lowest Balance</option>
              <option value="limit-desc">Highest Limit</option>
              <option value="limit-asc">Lowest Limit</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards List */}
      {filteredAndSortedCards.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500">
            {cards.length === 0 ? (
              <>
                <h3 className="text-lg font-medium mb-2">No cards yet</h3>
                <p>Create your first virtual card to get started.</p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium mb-2">No cards match your filters</h3>
                <p>Try adjusting your search terms or filters.</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedCards.map((card) => (
            <CardComponent
              key={card.cardId}
              card={card}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
}