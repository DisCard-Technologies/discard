import { z } from 'zod';

export const WaitlistSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  company: z.string().max(255, 'Company name too long').optional(),
  product: z.enum(['discard', 'textpay', 'both'], {
    required_error: 'Please select a product'
  }),
  useCase: z.string().max(1000, 'Use case description too long').optional(),
  agreeToUpdates: z.boolean().refine(val => val === true, {
    message: 'You must agree to receive updates'
  })
});

export type WaitlistFormData = z.infer<typeof WaitlistSchema>;