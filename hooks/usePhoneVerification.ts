/**
 * DisCard 2035 - usePhoneVerification Hook
 *
 * React hook for phone number verification flow:
 * - Request OTP
 * - Verify code
 * - Track countdown for resend
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useConvexUserId, isLocalUserId } from "@/stores/authConvex";

// ============================================================================
// Types
// ============================================================================

export type VerificationStep = "input" | "verify" | "success";

export interface UsePhoneVerificationReturn {
  // State
  step: VerificationStep;
  phoneNumber: string;
  isLoading: boolean;
  error: string | null;

  // Countdown
  countdown: number;
  canResend: boolean;

  // Actions
  setPhoneNumber: (phone: string) => void;
  requestVerification: () => Promise<void>;
  verifyCode: (code: string) => Promise<boolean>;
  resendCode: () => Promise<void>;
  reset: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const RESEND_COOLDOWN_SECONDS = 60;

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePhoneVerification(): UsePhoneVerificationReturn {
  // Get userId from auth store - only valid Convex IDs, null for local users
  const userId = useConvexUserId();

  // State
  const [step, setStep] = useState<VerificationStep>("input");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [verificationId, setVerificationId] = useState<Id<"phoneVerifications"> | null>(null);

  // Countdown timer ref
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Convex mutations/actions
  const requestVerificationMutation = useMutation(api.auth.phoneVerification.requestVerification);
  const verifyCodeMutation = useMutation(api.auth.phoneVerification.verifyCode);
  const linkPhoneDevMutation = useMutation(api.auth.phoneVerification.linkPhoneDev);
  const sendSMSAction = useAction(api.auth.phoneVerification.sendVerificationSMS);

  // Check if user already has verified phone
  const hasVerifiedPhone = useQuery(api.auth.phoneVerification.hasVerifiedPhone);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Start countdown timer
  const startCountdown = useCallback(() => {
    setCountdown(RESEND_COOLDOWN_SECONDS);

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Request verification - BYPASSED FOR DEV: directly saves phone number
  const requestVerification = useCallback(async () => {
    if (!phoneNumber.trim()) {
      setError("Please enter a phone number");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // DEV BYPASS: Skip OTP, directly save phone number using simple mutation
      // Pass userId if available, otherwise mutation will use auth identity
      await linkPhoneDevMutation({ phoneNumber, ...(userId && { userId }) });

      // Skip directly to success
      setStep("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save phone number";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [phoneNumber, userId, linkPhoneDevMutation]);

  // Verify code
  const verifyCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!code.trim()) {
        setError("Please enter the verification code");
        return false;
      }

      if (code.length !== 6) {
        setError("Please enter all 6 digits");
        return false;
      }

      if (!userId) {
        setError("Phone verification requires a Convex account. Local/dev users are not supported yet.");
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        await verifyCodeMutation({ phoneNumber, code, userId });
        setStep("success");
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Verification failed";
        setError(message);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [phoneNumber, userId, verifyCodeMutation]
  );

  // Resend code
  const resendCode = useCallback(async () => {
    if (countdown > 0) {
      return;
    }

    if (!userId) {
      setError("Phone verification requires a Convex account. Local/dev users are not supported yet.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create new verification record
      const result = await requestVerificationMutation({ phoneNumber, userId });
      setVerificationId(result.verificationId);

      // Send SMS
      await sendSMSAction({ verificationId: result.verificationId });

      // Restart countdown
      startCountdown();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resend code";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [countdown, phoneNumber, userId, requestVerificationMutation, sendSMSAction, startCountdown]);

  // Reset state
  const reset = useCallback(() => {
    setStep("input");
    setPhoneNumber("");
    setIsLoading(false);
    setError(null);
    setCountdown(0);
    setVerificationId(null);

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
  }, []);

  return {
    // State
    step,
    phoneNumber,
    isLoading,
    error,

    // Countdown
    countdown,
    canResend: countdown === 0,

    // Actions
    setPhoneNumber,
    requestVerification,
    verifyCode,
    resendCode,
    reset,
  };
}

// ============================================================================
// Export Default
// ============================================================================

export default usePhoneVerification;
