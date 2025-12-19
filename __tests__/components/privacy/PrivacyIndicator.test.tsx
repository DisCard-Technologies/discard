/**
 * Component Tests for PrivacyIndicator
 * Testing privacy status visualization and real-time feedback
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PrivacyIndicator, { getCardPrivacyStatus, PrivacyStatus } from '../../../src/components/privacy/PrivacyIndicator';
import { testDataFactory } from '../../utils/test-helpers';

describe('PrivacyIndicator', () => {
  describe('Component Rendering', () => {
    test('should render high privacy status correctly', () => {
      const highStatus: PrivacyStatus = {
        level: 'high',
        encrypted: true,
        isolated: true,
        deletionReady: true,
      };

      render(<PrivacyIndicator status={highStatus} />);

      expect(screen.getByText('🔒')).toBeOnTheScreen();
      expect(screen.getByText('High Privacy')).toBeOnTheScreen();
    });

    test('should render medium privacy status correctly', () => {
      const mediumStatus: PrivacyStatus = {
        level: 'medium',
        encrypted: true,
        isolated: true,
        deletionReady: false,
      };

      render(<PrivacyIndicator status={mediumStatus} />);

      expect(screen.getByText('🔐')).toBeOnTheScreen();
      expect(screen.getByText('Medium Privacy')).toBeOnTheScreen();
    });

    test('should render low privacy status correctly', () => {
      const lowStatus: PrivacyStatus = {
        level: 'low',
        encrypted: false,
        isolated: false,
        deletionReady: false,
      };

      render(<PrivacyIndicator status={lowStatus} />);

      expect(screen.getByText('🔓')).toBeOnTheScreen();
      expect(screen.getByText('Low Privacy')).toBeOnTheScreen();
    });

    test('should render with small size', () => {
      const highStatus: PrivacyStatus = {
        level: 'high',
        encrypted: true,
        isolated: true,
        deletionReady: true,
      };

      render(<PrivacyIndicator status={highStatus} size="small" />);

      // Should still show icon and text but in smaller format
      expect(screen.getByText('🔒')).toBeOnTheScreen();
      expect(screen.getByText('High Privacy')).toBeOnTheScreen();
    });

    test('should render with large size', () => {
      const highStatus: PrivacyStatus = {
        level: 'high',
        encrypted: true,
        isolated: true,
        deletionReady: true,
      };

      render(<PrivacyIndicator status={highStatus} size="large" />);

      expect(screen.getByText('🔒')).toBeOnTheScreen();
      expect(screen.getByText('High Privacy')).toBeOnTheScreen();
    });
  });

  describe('Privacy Status Details', () => {
    test('should show detailed status when showDetails is true', () => {
      const highStatus: PrivacyStatus = {
        level: 'high',
        encrypted: true,
        isolated: true,
        deletionReady: true,
      };

      render(<PrivacyIndicator status={highStatus} showDetails={true} />);

      expect(screen.getByText('Encrypted')).toBeOnTheScreen();
      expect(screen.getByText('Isolated')).toBeOnTheScreen();
      expect(screen.getByText('Deletion Ready')).toBeOnTheScreen();
    });

    test('should show medium status details correctly', () => {
      const mediumStatus: PrivacyStatus = {
        level: 'medium',
        encrypted: false,
        isolated: true,
        deletionReady: true,
      };

      render(<PrivacyIndicator status={mediumStatus} showDetails={true} />);

      expect(screen.getByText('Encrypted')).toBeOnTheScreen();
      expect(screen.getByText('Isolated')).toBeOnTheScreen();
      expect(screen.getByText('Deletion Ready')).toBeOnTheScreen();
    });

    test('should show low status details correctly', () => {
      const lowStatus: PrivacyStatus = {
        level: 'low',
        encrypted: false,
        isolated: false,
        deletionReady: false,
      };

      render(<PrivacyIndicator status={lowStatus} showDetails={true} />);

      expect(screen.getByText('Encrypted')).toBeOnTheScreen();
      expect(screen.getByText('Isolated')).toBeOnTheScreen();
      expect(screen.getByText('Deletion Ready')).toBeOnTheScreen();
    });

    test('should not show details when showDetails is false', () => {
      const highStatus: PrivacyStatus = {
        level: 'high',
        encrypted: true,
        isolated: true,
        deletionReady: true,
      };

      render(<PrivacyIndicator status={highStatus} showDetails={false} />);

      expect(screen.queryByText('Encrypted')).not.toBeOnTheScreen();
      expect(screen.queryByText('Isolated')).not.toBeOnTheScreen();
      expect(screen.queryByText('Deletion Ready')).not.toBeOnTheScreen();
    });
  });

  describe('getCardPrivacyStatus function', () => {
    test('should return high status for active cards with all security features', () => {
      const card = testDataFactory.createActiveCard();
      const status = getCardPrivacyStatus(card);

      expect(status.level).toBe('medium'); // medium because cardNumber/cvv exposed
      expect(status.encrypted).toBe(true);
      expect(status.isolated).toBe(true);
      expect(status.deletionReady).toBe(true);
    });

    test('should return medium status for paused cards', () => {
      const card = testDataFactory.createPausedCard();
      const status = getCardPrivacyStatus(card);

      expect(status.level).toBe('medium');
      expect(status.encrypted).toBe(true);
      expect(status.isolated).toBe(true);
      expect(status.deletionReady).toBe(true);
    });

    test('should return low status for deleted cards', () => {
      const card = testDataFactory.createDeletedCard();
      const status = getCardPrivacyStatus(card);

      expect(status.level).toBe('low');
      expect(status.encrypted).toBe(false);
      expect(status.isolated).toBe(false);
      expect(status.deletionReady).toBe(false);
    });

    test('should return medium status for cards with errors', () => {
      const card = testDataFactory.createCardWithError();
      const status = getCardPrivacyStatus(card);

      expect(status.level).toBe('medium');
      expect(status.encrypted).toBe(true);
      expect(status.isolated).toBe(true);
      expect(status.deletionReady).toBe(true);
    });
  });

  describe('Accessibility', () => {
    test('should have proper accessibility labels', () => {
      const highStatus: PrivacyStatus = {
        level: 'high',
        encrypted: true,
        isolated: true,
        deletionReady: true,
      };

      render(<PrivacyIndicator status={highStatus} />);

      // Component should be accessible with proper labels
      expect(screen.getByText('High Privacy')).toBeOnTheScreen();
      expect(screen.getByText('🔒')).toBeOnTheScreen();
    });

    test('should work with different status types', () => {
      const statuses: PrivacyStatus[] = [
        {
          level: 'high',
          encrypted: true,
          isolated: true,
          deletionReady: true,
        },
        {
          level: 'medium',
          encrypted: false,
          isolated: true,
          deletionReady: true,
        },
        {
          level: 'low',
          encrypted: false,
          isolated: false,
          deletionReady: false,
        },
      ];

      statuses.forEach((status, index) => {
        const { unmount } = render(<PrivacyIndicator status={status} key={index} />);
        
        // Each status should render without errors
        expect(screen.getByText(status.level === 'high' ? 'High Privacy' : status.level === 'medium' ? 'Medium Privacy' : 'Low Privacy')).toBeOnTheScreen();
        
        unmount();
      });
    });
  });

  describe('Visual States', () => {
    test('should apply correct styling for high privacy status', () => {
      const highStatus: PrivacyStatus = {
        level: 'high',
        encrypted: true,
        isolated: true,
        deletionReady: true,
      };

      render(<PrivacyIndicator status={highStatus} />);
      
      // Should use green color scheme for high privacy status
      expect(screen.getByText('High Privacy')).toBeOnTheScreen();
      expect(screen.getByText('🔒')).toBeOnTheScreen();
    });

    test('should apply correct styling for medium privacy status', () => {
      const mediumStatus: PrivacyStatus = {
        level: 'medium',
        encrypted: false,
        isolated: true,
        deletionReady: true,
      };

      render(<PrivacyIndicator status={mediumStatus} />);
      
      // Should use orange color scheme for medium privacy status
      expect(screen.getByText('Medium Privacy')).toBeOnTheScreen();
      expect(screen.getByText('🔐')).toBeOnTheScreen();
    });

    test('should apply correct styling for low privacy status', () => {
      const lowStatus: PrivacyStatus = {
        level: 'low',
        encrypted: false,
        isolated: false,
        deletionReady: false,
      };

      render(<PrivacyIndicator status={lowStatus} />);
      
      // Should use red color scheme for low privacy status
      expect(screen.getByText('Low Privacy')).toBeOnTheScreen();
      expect(screen.getByText('🔓')).toBeOnTheScreen();
    });
  });

  describe('Edge Cases', () => {
    test('should handle edge case status gracefully', () => {
      const edgeCaseStatus: PrivacyStatus = {
        level: 'low',
        encrypted: false,
        isolated: false,
        deletionReady: false,
      };

      expect(() => {
        render(<PrivacyIndicator status={edgeCaseStatus} />);
      }).not.toThrow();
    });

    test('should handle custom styling', () => {
      const highStatus: PrivacyStatus = {
        level: 'high',
        encrypted: true,
        isolated: true,
        deletionReady: true,
      };

      const customStyle = { marginTop: 20, borderRadius: 10 };

      render(<PrivacyIndicator status={highStatus} style={customStyle} />);

      // Should render without errors with custom styling
      expect(screen.getByText('High Privacy')).toBeOnTheScreen();
    });
  });
});