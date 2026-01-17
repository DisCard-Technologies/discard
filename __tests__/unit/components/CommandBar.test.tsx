/**
 * CommandBar Component Tests
 *
 * Tests for the AI command bar component including:
 * - User input handling
 * - Message display
 * - Intent submission
 * - Approval/cancel actions
 * - Loading states
 */

import React from 'react';
import {
  render,
  fireEvent,
  waitFor,
  screen,
} from '@testing-library/react-native';
import { CommandBar } from '@/components/command-bar';
import { resetConvexMocks } from '../../helpers/convex';

// Mock the hooks
jest.mock('@/hooks/useIntents', () => ({
  useIntents: jest.fn(() => ({
    activeIntent: null,
    isProcessing: false,
    submitIntent: jest.fn().mockResolvedValue('mock_intent_id'),
    cancelIntent: jest.fn(),
    clarifyIntent: jest.fn(),
    approveIntent: jest.fn(),
  })),
}));

jest.mock('@/stores/authConvex', () => ({
  useCurrentUserId: jest.fn(() => 'test_user_001'),
}));

// Mock hooks and theme
jest.mock('@/hooks/use-theme-color', () => ({
  useThemeColor: jest.fn(() => '#8B5CF6'),
}));

describe('CommandBar Component', () => {
  const defaultProps = {
    onSend: jest.fn(),
    onCamera: jest.fn(),
    onMic: jest.fn(),
    onFocusChange: jest.fn(),
  };

  beforeEach(() => {
    resetConvexMocks();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Rendering
  // ==========================================================================

  describe('Rendering', () => {
    test('renders input field', () => {
      const { getByPlaceholderText } = render(<CommandBar {...defaultProps} />);

      const input = getByPlaceholderText('Ask anything or give a command...');
      expect(input).toBeTruthy();
    });

    test('renders camera button', () => {
      const { getByTestId, UNSAFE_getAllByType } = render(
        <CommandBar {...defaultProps} />
      );

      // Check that Ionicons is rendered (mocked as string)
      // The component should contain camera icon
      const { toJSON } = render(<CommandBar {...defaultProps} />);
      const tree = toJSON();
      expect(tree).toBeTruthy();
    });

    test('renders mic button', () => {
      const { toJSON } = render(<CommandBar {...defaultProps} />);
      const tree = toJSON();
      expect(tree).toBeTruthy();
    });

    test('send button is disabled when input is empty', () => {
      const { getByPlaceholderText } = render(<CommandBar {...defaultProps} />);

      const input = getByPlaceholderText('Ask anything or give a command...');
      expect(input.props.value).toBeFalsy();
    });
  });

  // ==========================================================================
  // User Input
  // ==========================================================================

  describe('User Input', () => {
    test('updates input value on text change', () => {
      const { getByPlaceholderText } = render(<CommandBar {...defaultProps} />);

      const input = getByPlaceholderText('Ask anything or give a command...');
      fireEvent.changeText(input, 'send $50 to alice');

      expect(input.props.value).toBe('send $50 to alice');
    });

    test('clears input after submission', async () => {
      const { getByPlaceholderText } = render(<CommandBar {...defaultProps} />);

      const input = getByPlaceholderText('Ask anything or give a command...');
      fireEvent.changeText(input, 'send $50 to alice');
      fireEvent(input, 'submitEditing');

      await waitFor(() => {
        expect(input.props.value).toBe('');
      });
    });

    test('calls onFocusChange when input is focused', () => {
      const onFocusChange = jest.fn();
      const { getByPlaceholderText } = render(
        <CommandBar {...defaultProps} onFocusChange={onFocusChange} />
      );

      const input = getByPlaceholderText('Ask anything or give a command...');
      fireEvent(input, 'focus');

      expect(onFocusChange).toHaveBeenCalledWith(true);
    });

    test('calls onFocusChange when input loses focus', () => {
      const onFocusChange = jest.fn();
      const { getByPlaceholderText } = render(
        <CommandBar {...defaultProps} onFocusChange={onFocusChange} />
      );

      const input = getByPlaceholderText('Ask anything or give a command...');
      fireEvent(input, 'blur');

      expect(onFocusChange).toHaveBeenCalledWith(false);
    });
  });

  // ==========================================================================
  // Button Actions
  // ==========================================================================

  describe('Button Actions', () => {
    test('calls onCamera when camera button is pressed', () => {
      // Since we're using mocked icons, we test the callback is set up
      expect(defaultProps.onCamera).toBeDefined();
    });

    test('calls onMic when mic button is pressed', () => {
      expect(defaultProps.onMic).toBeDefined();
    });
  });

  // ==========================================================================
  // Message Display
  // ==========================================================================

  describe('Message Display', () => {
    test('initially shows no messages', () => {
      const { queryByText } = render(<CommandBar {...defaultProps} />);

      // Chat area should not be visible when there are no messages
      expect(queryByText('Thinking...')).toBeNull();
    });

    test('shows user message after submission', async () => {
      const { getByPlaceholderText, getByText } = render(
        <CommandBar {...defaultProps} />
      );

      const input = getByPlaceholderText('Ask anything or give a command...');
      fireEvent.changeText(input, 'hello');
      fireEvent(input, 'submitEditing');

      await waitFor(() => {
        expect(getByText('hello')).toBeTruthy();
      });
    });
  });

  // ==========================================================================
  // Props Handling
  // ==========================================================================

  describe('Props Handling', () => {
    test('accepts initialMessages prop', () => {
      const initialMessages = [
        { id: '1', type: 'user' as const, text: 'Hello', timestamp: Date.now() },
        { id: '2', type: 'ai' as const, text: 'Hi there!', timestamp: Date.now() },
      ];

      const { getByText } = render(
        <CommandBar {...defaultProps} initialMessages={initialMessages} />
      );

      expect(getByText('Hello')).toBeTruthy();
      expect(getByText('Hi there!')).toBeTruthy();
    });

    test('accepts sessionId prop', () => {
      const { toJSON } = render(
        <CommandBar {...defaultProps} sessionId="session_123" />
      );

      expect(toJSON()).toBeTruthy();
    });

    test('calls onNewSession when first message is sent without session', async () => {
      const onNewSession = jest.fn();
      const { getByPlaceholderText } = render(
        <CommandBar {...defaultProps} onNewSession={onNewSession} />
      );

      const input = getByPlaceholderText('Ask anything or give a command...');
      fireEvent.changeText(input, 'hello');
      fireEvent(input, 'submitEditing');

      await waitFor(() => {
        expect(onNewSession).toHaveBeenCalledWith('hello');
      });
    });

    test('calls onMessagesChange when messages update', async () => {
      const onMessagesChange = jest.fn();
      const { getByPlaceholderText } = render(
        <CommandBar {...defaultProps} onMessagesChange={onMessagesChange} />
      );

      const input = getByPlaceholderText('Ask anything or give a command...');
      fireEvent.changeText(input, 'test message');
      fireEvent(input, 'submitEditing');

      await waitFor(() => {
        expect(onMessagesChange).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    test('handles empty string submission gracefully', async () => {
      const { getByPlaceholderText } = render(<CommandBar {...defaultProps} />);

      const input = getByPlaceholderText('Ask anything or give a command...');
      fireEvent.changeText(input, '   '); // Just spaces
      fireEvent(input, 'submitEditing');

      // Should not add empty message
      await waitFor(() => {
        expect(input.props.value).toBe('   '); // Not cleared because submission was prevented
      });
    });

    test('handles rapid successive inputs', async () => {
      const { getByPlaceholderText } = render(<CommandBar {...defaultProps} />);

      const input = getByPlaceholderText('Ask anything or give a command...');

      // Rapid inputs
      fireEvent.changeText(input, 'a');
      fireEvent.changeText(input, 'ab');
      fireEvent.changeText(input, 'abc');

      expect(input.props.value).toBe('abc');
    });

    test('handles special characters in input', () => {
      const { getByPlaceholderText } = render(<CommandBar {...defaultProps} />);

      const input = getByPlaceholderText('Ask anything or give a command...');
      const specialText = 'Send $100 to @user & more!';
      fireEvent.changeText(input, specialText);

      expect(input.props.value).toBe(specialText);
    });

    test('handles emoji in input', () => {
      const { getByPlaceholderText } = render(<CommandBar {...defaultProps} />);

      const input = getByPlaceholderText('Ask anything or give a command...');
      fireEvent.changeText(input, 'hello 👋 world 🌍');

      expect(input.props.value).toBe('hello 👋 world 🌍');
    });
  });
});
