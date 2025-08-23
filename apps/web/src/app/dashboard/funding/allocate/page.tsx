'use client';

/**
 * Fund allocation page - allocate funds to specific cards
 */

import React from 'react';
import Link from 'next/link';
import { AllocationManager } from '../../../../components/funding/AllocationManager';

export default function AllocateFundsPage() {
  const handleAllocationSuccess = () => {
    // Redirect to funding dashboard with success message
    window.location.href = '/dashboard/funding?success=allocation';
  };

  const handleCancel = () => {
    // Redirect back to funding dashboard
    window.location.href = '/dashboard/funding';
  };

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
            <h1 className="text-3xl font-bold text-gray-900">Allocate Funds</h1>
            <p className="mt-1 text-gray-600">
              Move funds from your account to a specific card.
            </p>
          </div>
        </div>

        {/* Allocation Manager */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <AllocationManager
            onSuccess={handleAllocationSuccess}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
  );
}