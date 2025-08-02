'use client';

/**
 * Card creation page
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateCard } from '../../../../lib/hooks/useCards';
import { CardCreationForm } from '../../../../components/cards/CardCreationForm';
import { CardComponent } from '../../../../components/cards/CardComponent';
import { CreateCardRequest, Card } from '../../../../../../../packages/shared/src/types/index';
import { ArrowLeftIcon, CheckCircleIcon } from '../../../../lib/stubs';
import Link from 'next/link';

export default function CreateCardPage() {
  const router = useRouter();
  const [createdCard, setCreatedCard] = useState<Card & { cardNumber?: string; cvv?: string } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const createCardMutation = useCreateCard();

  const handleCreateCard = async (data: CreateCardRequest) => {
    try {
      const newCard = await createCardMutation.mutateAsync(data);
      
      // In a real implementation, the API would return sensitive data temporarily
      // For demo purposes, we'll simulate this
      const cardWithSensitiveData = {
        ...newCard,
        cardNumber: '4532123456789012', // Simulated card number
        cvv: '123', // Simulated CVV
      };
      
      setCreatedCard(cardWithSensitiveData);
      setShowSuccess(true);

      // Clear sensitive data after 5 minutes for security
      setTimeout(() => {
        setCreatedCard((prev: any) => prev ? { ...prev, cardNumber: undefined, cvv: undefined } : null);
      }, 5 * 60 * 1000);

    } catch (error: any) {
      console.error('Failed to create card:', error);
      // Error handling is done in the form component
    }
  };

  const handleContinue = () => {
    router.push('/dashboard/cards');
  };

  const handleCreateAnother = () => {
    setCreatedCard(null);
    setShowSuccess(false);
    createCardMutation.reset();
  };

  if (showSuccess && createdCard) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard/cards"
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeftIcon className="w-4 h-4 mr-1" />
              Back to Cards
            </Link>
          </div>

          {/* Success Message */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
            <div className="flex items-center">
              <CheckCircleIcon className="w-8 h-8 text-green-600 mr-3" />
              <div>
                <h2 className="text-xl font-semibold text-green-900">Card Created Successfully!</h2>
                <p className="text-green-700 mt-1">
                  Your virtual card has been created with enhanced privacy protection.
                </p>
              </div>
            </div>
          </div>

          {/* Important Security Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-medium text-yellow-900 mb-2">⚠️ Important Security Notice</h3>
            <ul className="text-yellow-800 space-y-1 text-sm">
              <li>• Card details are shown only once for security reasons</li>
              <li>• Copy your card information now if you need it immediately</li>
              <li>• Sensitive data will be cleared automatically in 5 minutes</li>
              <li>• You can always view card details (except sensitive data) from the dashboard</li>
            </ul>
          </div>

          {/* Card Display */}
          <div className="mb-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Your New Virtual Card</h3>
            <CardComponent
              card={createdCard}
              cardNumber={createdCard.cardNumber}
              cvv={createdCard.cvv}
              showSensitiveData={true}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <button
              onClick={handleCreateAnother}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Create Another Card
            </button>
            <button
              onClick={handleContinue}
              className="inline-flex items-center px-6 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Go to Dashboard
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
        <div className="mb-8">
          <Link
            href="/dashboard/cards"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Back to Cards
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Create Virtual Card</h1>
          <p className="mt-1 text-gray-600">
            Create a new disposable virtual card with custom settings and enhanced privacy protection.
          </p>
        </div>

        {/* Creation Form */}
        <CardCreationForm
          onSubmit={handleCreateCard}
          isLoading={createCardMutation.isLoading}
          error={(createCardMutation.error as any).message || null}
        />
      </div>
    </div>
  );
}