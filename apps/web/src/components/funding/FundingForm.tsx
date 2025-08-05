'use client';

/**
 * Funding Form Component for Web
 * Handles account funding, card allocation, and transfer operations
 */

import React, { useState } from 'react';
import { 
  validateFundingAmount, 
  validateTransferAmount,
  formatCurrency
} from '@discard/shared/src/utils/funding';
import { 
  AccountFundingRequest, 
  CardAllocationRequest, 
  CardTransferRequest 
} from '@discard/shared';

interface FundingFormProps {
  mode: 'fund' | 'allocate' | 'transfer';
  cardId?: string; // Required for allocate mode
  sourceCardId?: string; // Required for transfer mode
  targetCardId?: string; // Required for transfer mode
  onSuccess?: (transactionId: string) => void;
  onCancel?: () => void;
  availableBalance?: number;
  sourceCardBalance?: number;
}

export function FundingForm({
  mode,
  cardId,
  sourceCardId,
  targetCardId,
  onSuccess,
  onCancel,
  availableBalance = 0,
  sourceCardBalance = 0,
}: FundingFormProps) {
  // Form state
  const [amount, setAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Error state
  const [amountError, setAmountError] = useState<string | null>(null);
  const [paymentMethodError, setPaymentMethodError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateAmount = (amountString: string): boolean => {
    const amountCents = Math.round(parseFloat(amountString) * 100);
    
    if (isNaN(amountCents) || amountCents <= 0) {
      setAmountError('Please enter a valid amount');
      return false;
    }

    if (mode === 'fund') {
      const validation = validateFundingAmount(amountCents);
      if (!validation.isValid) {
        setAmountError(validation.error || 'Invalid funding amount');
        return false;
      }
    } else {
      // For allocate and transfer, check against available balance
      const availableForOperation = mode === 'allocate' 
        ? availableBalance
        : sourceCardBalance;
      
      const validation = validateTransferAmount(amountCents, availableForOperation);
      if (!validation.isValid) {
        setAmountError(validation.error || 'Invalid transfer amount');
        return false;
      }
    }

    setAmountError(null);
    return true;
  };

  const validatePaymentMethod = (): boolean => {
    if (mode === 'fund' && !paymentMethodId.trim()) {
      setPaymentMethodError('Please enter a payment method ID');
      return false;
    }
    setPaymentMethodError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setSubmitError(null);
    
    // Validate inputs
    if (!validateAmount(amount) || !validatePaymentMethod()) {
      return;
    }

    const amountCents = Math.round(parseFloat(amount) * 100);
    setIsSubmitting(true);

    try {
      // API calls using fetch (to be replaced with proper API client)
      let result;
      
      if (mode === 'fund') {
        const request: AccountFundingRequest = {
          amount: amountCents,
          paymentMethodId,
          currency,
        };
        
        const response = await fetch('/api/v1/funding/account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`, // Replace with proper auth
          },
          body: JSON.stringify(request),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Account funding failed');
        }
        
        const data = await response.json();
        result = data.data.transaction;
      } else if (mode === 'allocate' && cardId) {
        const request: CardAllocationRequest = {
          cardId,
          amount: amountCents,
        };
        
        const response = await fetch(`/api/v1/funding/card/${cardId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`, // Replace with proper auth
          },
          body: JSON.stringify({ amount: amountCents }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Card allocation failed');
        }
        
        const data = await response.json();
        result = data.data.transaction;
      } else if (mode === 'transfer' && sourceCardId && targetCardId) {
        const request: CardTransferRequest = {
          fromCardId: sourceCardId,
          toCardId: targetCardId,
          amount: amountCents,
        };
        
        const response = await fetch('/api/v1/funding/transfer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`, // Replace with proper auth
          },
          body: JSON.stringify(request),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Card transfer failed');
        }
        
        const data = await response.json();
        result = data.data.transaction;
      }

      if (result) {
        onSuccess?.(result.id);
        // Reset form
        setAmount('');
        setPaymentMethodId('');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only allow numbers and decimal point
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setAmount(value);
      
      // Clear error when user starts typing
      if (amountError) {
        setAmountError(null);
      }
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'fund':
        return 'Fund Account';
      case 'allocate':
        return 'Allocate to Card';
      case 'transfer':
        return 'Transfer Between Cards';
      default:
        return 'Funding Operation';
    }
  };

  const getSubmitText = () => {
    if (isSubmitting) {
      return mode === 'fund' ? 'Funding...' : 
             mode === 'allocate' ? 'Allocating...' : 
             'Transferring...';
    }
    
    return mode === 'fund' ? 'Fund Account' : 
           mode === 'allocate' ? 'Allocate Funds' : 
           'Transfer Funds';
  };

  const getBalanceInfo = () => {
    if (mode === 'fund') {
      return null; // No balance restriction for funding
    } else if (mode === 'allocate') {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
          <p className="text-sm text-blue-800">
            Available for allocation: <span className="font-semibold">{formatCurrency(availableBalance)}</span>
          </p>
        </div>
      );
    } else if (mode === 'transfer') {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
          <p className="text-sm text-blue-800">
            Source card balance: <span className="font-semibold">{formatCurrency(sourceCardBalance)}</span>
          </p>
        </div>
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Balance Information */}
      {getBalanceInfo()}

      {/* Amount Input */}
      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
          Amount
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-500 sm:text-sm">$</span>
          </div>
          <input
            type="text"
            id="amount"
            value={amount}
            onChange={handleAmountChange}
            className={`block w-full pl-7 pr-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 sm:text-sm ${
              amountError 
                ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
            }`}
            placeholder="0.00"
            disabled={isSubmitting}
          />
        </div>
        {amountError && (
          <p className="mt-1 text-sm text-red-600">{amountError}</p>
        )}
      </div>

      {/* Payment Method Input (only for funding) */}
      {mode === 'fund' && (
        <div>
          <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">
            Payment Method ID
          </label>
          <input
            type="text"
            id="paymentMethod"
            value={paymentMethodId}
            onChange={(e) => {
              setPaymentMethodId(e.target.value);
              if (paymentMethodError) {
                setPaymentMethodError(null);
              }
            }}
            className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 sm:text-sm ${
              paymentMethodError 
                ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
            }`}
            placeholder="pm_1234567890abcdef"
            disabled={isSubmitting}
          />
          {paymentMethodError && (
            <p className="mt-1 text-sm text-red-600">{paymentMethodError}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            Enter your Stripe payment method ID from your payment setup
          </p>
        </div>
      )}

      {/* Currency Selection (only for funding) */}
      {mode === 'fund' && (
        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
            Currency
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            disabled={isSubmitting}
          >
            <option value="USD">USD - US Dollar</option>
            <option value="EUR">EUR - Euro</option>
            <option value="GBP">GBP - British Pound</option>
          </select>
        </div>
      )}

      {/* Error Display */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-red-800">Error</h4>
              <p className="text-sm text-red-700 mt-1">{submitError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !amount.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {isSubmitting && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {getSubmitText()}
        </button>
      </div>
    </form>
  );
}