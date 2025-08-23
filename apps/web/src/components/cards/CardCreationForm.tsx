/**
 * Card creation form component
 */

import React, { useState } from 'react';
import { useForm } from '../../lib/stubs';
import { CreateCardRequest } from '@discard/shared';
import { CreditCardIcon, ShieldCheckIcon } from '../../lib/stubs';

interface CardCreationFormProps {
  // eslint-disable-next-line no-unused-vars
  onSubmit: (data: CreateCardRequest) => void;
  isLoading?: boolean;
  error?: string | null;
}

interface FormData {
  spendingLimit: string;
  expirationMonths: string;
  merchantRestrictions: string[];
  customMerchantCode: string;
}

const MERCHANT_CATEGORIES = [
  { code: '5411', name: 'Grocery Stores' },
  { code: '5812', name: 'Restaurants' },
  { code: '5541', name: 'Gas Stations' },
  { code: '5399', name: 'General Merchandise' },
  { code: '5732', name: 'Electronics' },
  { code: '5691', name: 'Clothing' },
  { code: '5943', name: 'Office Supplies' },
  { code: '5999', name: 'Miscellaneous' },
];

export function CardCreationForm({ onSubmit, isLoading = false, error }: CardCreationFormProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm({
    defaultValues: {
      spendingLimit: '50000', // $500 in cents
      expirationMonths: '12',
      merchantRestrictions: [],
      customMerchantCode: '',
    },
  });

  const spendingLimitValue = watch('spendingLimit');
  const expirationMonths = watch('expirationMonths');

  const handleCategoryToggle = (categoryCode: string) => {
    const newCategories = selectedCategories.includes(categoryCode)
      ? selectedCategories.filter(code => code !== categoryCode)
      : [...selectedCategories, categoryCode];
    
    setSelectedCategories(newCategories);
    setValue('merchantRestrictions', newCategories);
  };

  const handleAddCustomCategory = () => {
    const customCode = watch('customMerchantCode');
    if (customCode && !selectedCategories.includes(customCode)) {
      const newCategories = [...selectedCategories, customCode];
      setSelectedCategories(newCategories);
      setValue('merchantRestrictions', newCategories);
      setValue('customMerchantCode', '');
    }
  };

  const onFormSubmit = (data: FormData) => {
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + parseInt(data.expirationMonths));

    const request: CreateCardRequest = {
      spendingLimit: parseInt(data.spendingLimit),
      expirationDate: expirationDate.toISOString(),
      merchantRestrictions: selectedCategories.length > 0 ? selectedCategories : undefined,
    };

    onSubmit(request);
  };

  const formatCurrency = (cents: string) => {
    const amount = parseInt(cents) || 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const getExpirationDate = (months: string) => {
    const date = new Date();
    date.setMonth(date.getMonth() + parseInt(months));
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <CreditCardIcon className="w-6 h-6 text-indigo-600 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900">Create New Virtual Card</h2>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Configure your disposable virtual card with custom spending limits and restrictions.
        </p>
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} className="p-6 space-y-6">
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="text-red-800">{error}</div>
          </div>
        )}

        {/* Spending Limit */}
        <div>
          <label htmlFor="spendingLimit" className="block text-sm font-medium text-gray-700">
            Spending Limit
          </label>
          <div className="mt-1">
            <input
              type="range"
              id="spendingLimit"
              min="100"
              max="500000"
              step="100"
              {...register('spendingLimit', {
                required: 'Spending limit is required',
                min: { value: 100, message: 'Minimum spending limit is $1.00' },
                max: { value: 500000, message: 'Maximum spending limit is $5,000.00' },
              })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-sm text-gray-500 mt-1">
              <span>$1</span>
              <span className="font-medium text-lg text-gray-900">
                {formatCurrency(spendingLimitValue)}
              </span>
              <span>$5,000</span>
            </div>
          </div>
          <input
            type="number"
            min="100"
            max="500000"
            step="100"
            {...register('spendingLimit')}
            className="mt-2 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter amount in cents"
          />
          {errors.spendingLimit && (
            <p className="mt-1 text-sm text-red-600">{errors.spendingLimit.message}</p>
          )}
        </div>

        {/* Expiration */}
        <div>
          <label htmlFor="expirationMonths" className="block text-sm font-medium text-gray-700">
            Card Expiration
          </label>
          <div className="mt-1">
            <select
              id="expirationMonths"
              {...register('expirationMonths', { required: 'Expiration period is required' })}
              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="1">1 Month</option>
              <option value="3">3 Months</option>
              <option value="6">6 Months</option>
              <option value="12">12 Months</option>
              <option value="24">24 Months</option>
              <option value="36">36 Months</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Card will expire on {getExpirationDate(expirationMonths)}
            </p>
          </div>
          {errors.expirationMonths && (
            <p className="mt-1 text-sm text-red-600">{errors.expirationMonths.message}</p>
          )}
        </div>

        {/* Merchant Restrictions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Merchant Category Restrictions (Optional)
          </label>
          <p className="text-sm text-gray-500 mb-4">
            Restrict card usage to specific merchant categories for enhanced security.
          </p>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {MERCHANT_CATEGORIES.map((category) => (
              <label
                key={category.code}
                className={`relative flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                  selectedCategories.includes(category.code)
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category.code)}
                  onChange={() => handleCategoryToggle(category.code)}
                  className="sr-only"
                />
                <div className="flex-1">
                  <span className="block text-sm font-medium text-gray-900">
                    {category.name}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {category.code}
                  </span>
                </div>
                {selectedCategories.includes(category.code) && (
                  <ShieldCheckIcon className="w-5 h-5 text-indigo-600" />
                )}
              </label>
            ))}
          </div>

          {/* Custom Category */}
          <div className="mt-4 flex space-x-2">
            <input
              type="text"
              placeholder="Custom merchant code (e.g., 1234)"
              {...register('customMerchantCode')}
              className="flex-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleAddCustomCategory}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Add
            </button>
          </div>

          {selectedCategories.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-gray-700 mb-2">Selected restrictions:</p>
              <div className="flex flex-wrap gap-2">
                {selectedCategories.map((code) => {
                  const category = MERCHANT_CATEGORIES.find(cat => cat.code === code);
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                    >
                      {category ? category.name : code}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Privacy Notice */}
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <ShieldCheckIcon className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-green-800">Enhanced Privacy Protection</h4>
              <p className="text-sm text-green-700 mt-1">
                Your card will be created with cryptographic isolation, encrypted storage, 
                and secure deletion capabilities for maximum privacy protection.
              </p>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => {
              reset();
              setSelectedCategories([]);
            }}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating Card...' : 'Create Card'}
          </button>
        </div>
      </form>
    </div>
  );
}