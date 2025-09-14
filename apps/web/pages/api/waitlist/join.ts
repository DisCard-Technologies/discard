import { NextApiRequest, NextApiResponse } from 'next';
import { WaitlistDB } from '@/lib/db';
import { EmailService } from '@/lib/email';
import { WaitlistSchema } from '@/lib/validations';
import { getClientIP } from '@/lib/utils';
import { z } from 'zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request data
    const validatedData = WaitlistSchema.parse(req.body);

    // Get additional metadata
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'];
    const referrer = req.headers.referer;

    // Check if email already exists
    const existingEntry = await WaitlistDB.findByEmail(validatedData.email);
    if (existingEntry) {
      return res.status(400).json({ 
        error: 'Email already registered',
        message: 'This email is already on our waitlist. Check your inbox for your welcome email!'
      });
    }

    // Create waitlist entry
    const entry = await WaitlistDB.create({
      name: validatedData.name,
      email: validatedData.email,
      company: validatedData.company,
      product: validatedData.product,
      use_case: validatedData.useCase,
      agree_to_updates: validatedData.agreeToUpdates,
      ip_address: ip,
      user_agent: userAgent,
      referrer: referrer
    });

    // Send welcome email
    const emailSent = await EmailService.sendWelcomeEmail(entry);
    
    if (emailSent) {
      await WaitlistDB.updateEmailSent(entry.email);
      
      // Send notification to team (async, don't wait)
      EmailService.sendNotificationToTeam(entry).catch(console.error);
    }

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Successfully joined the waitlist!',
      data: {
        name: entry.name,
        email: entry.email,
        product: entry.product,
        emailSent
      }
    });

  } catch (error) {
    console.error('Waitlist signup error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }

    if (error instanceof Error && error.message === 'Email already exists in waitlist') {
      return res.status(400).json({
        error: 'Email already registered',
        message: 'This email is already on our waitlist!'
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Something went wrong. Please try again.'
    });
  }
}