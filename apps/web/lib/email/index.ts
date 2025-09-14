import { Resend } from 'resend';
import { WaitlistEntry } from '../db';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  static generateWelcomeEmail(entry: WaitlistEntry): EmailTemplate {
    const productName = entry.product === 'both' 
      ? 'DisCard and TextPay' 
      : entry.product === 'discard' 
        ? 'DisCard' 
        : 'TextPay';

    const subject = `Welcome to the ${productName} waitlist! 🎉`;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Discard Technologies</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #212121; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f1f1f1; padding: 40px 20px; text-align: center; }
            .logo { font-size: 32px; font-weight: bold; color: #212121; text-transform: uppercase; letter-spacing: -1px; }
            .content { padding: 40px 20px; }
            .highlight { background: #cdea68; padding: 20px; border-radius: 10px; margin: 20px 0; }
            .footer { background: #212121; color: white; padding: 30px 20px; text-align: center; }
            .button { display: inline-block; background: #212121; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; margin: 20px 0; }
            .social-links { margin-top: 20px; }
            .social-links a { color: #cdea68; text-decoration: none; margin: 0 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">Discard Technologies</div>
              <p>The Future of Borderless Payments</p>
            </div>
            
            <div class="content">
              <h1>Welcome to the future, ${entry.name}! 🚀</h1>
              
              <p>Thank you for joining the <strong>${productName}</strong> waitlist. You're now part of an exclusive group that will get early access to revolutionary payment technology.</p>
              
              <div class="highlight">
                <h3>What happens next?</h3>
                <ul>
                  <li><strong>Early Access:</strong> You'll be among the first to try ${productName} when we launch</li>
                  <li><strong>Exclusive Updates:</strong> Regular insights into our development progress</li>
                  <li><strong>Special Pricing:</strong> Potential early-bird pricing and exclusive offers</li>
                  <li><strong>Community Access:</strong> Join our Discord community for direct feedback opportunities</li>
                </ul>
              </div>
              
              <p>We're working hard to revolutionize global finance, and your interest motivates us every day.</p>
              
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/presentation" class="button">Learn More About Our Products</a>
            </div>
            
            <div class="footer">
              <p><strong>Stay Connected</strong></p>
              <div class="social-links">
                <a href="https://linkedin.com/company/discard-tech">LinkedIn</a>
                <a href="https://twitter.com/discardtech">Twitter</a>
                <a href="https://medium.com/@discardtech">Medium</a>
                <a href="https://discord.gg/discardtech">Discord</a>
              </div>
              <p style="margin-top: 30px; font-size: 14px; opacity: 0.8;">
                © 2025 Discard Technologies. All rights reserved.<br>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/privacy" style="color: #cdea68;">Privacy Policy</a> | 
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe" style="color: #cdea68;">Unsubscribe</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Welcome to the future, ${entry.name}!

      Thank you for joining the ${productName} waitlist. You're now part of an exclusive group that will get early access to revolutionary payment technology.

      What happens next?
      - Early Access: You'll be among the first to try ${productName} when we launch
      - Exclusive Updates: Regular insights into our development progress  
      - Special Pricing: Potential early-bird pricing and exclusive offers
      - Community Access: Join our Discord community for direct feedback opportunities

      We're working hard to revolutionize global finance, and your interest motivates us every day.

      Learn more: ${process.env.NEXT_PUBLIC_APP_URL}/presentation

      Stay Connected:
      - LinkedIn: https://linkedin.com/company/discard-tech
      - Twitter: https://twitter.com/discardtech
      - Medium: https://medium.com/@discardtech
      - Discord: https://discord.gg/discardtech

      © 2025 Discard Technologies. All rights reserved.
    `;

    return { subject, html, text };
  }

  static async sendWelcomeEmail(entry: WaitlistEntry): Promise<boolean> {
    try {
      const emailTemplate = this.generateWelcomeEmail(entry);
      
      await resend.emails.send({
        from: 'Discard Technologies <hello@discard.tech>',
        to: [entry.email],
        subject: emailTemplate.subject,
        html: emailTemplate.html,
        text: emailTemplate.text,
        tags: [
          { name: 'category', value: 'waitlist' },
          { name: 'product', value: entry.product }
        ]
      });

      return true;
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      return false;
    }
  }

  static async sendNotificationToTeam(entry: WaitlistEntry): Promise<void> {
    try {
      await resend.emails.send({
        from: 'Waitlist Notifications <notifications@discard.tech>',
        to: ['team@discard.tech'], // Replace with your team email
        subject: `New Waitlist Signup: ${entry.name} (${entry.product})`,
        html: `
          <h2>New Waitlist Signup</h2>
          <p><strong>Name:</strong> ${entry.name}</p>
          <p><strong>Email:</strong> ${entry.email}</p>
          <p><strong>Company:</strong> ${entry.company || 'Not provided'}</p>
          <p><strong>Product Interest:</strong> ${entry.product}</p>
          <p><strong>Use Case:</strong> ${entry.use_case || 'Not provided'}</p>
          <p><strong>Signed up:</strong> ${new Date().toLocaleString()}</p>
        `
      });
    } catch (error) {
      console.error('Failed to send team notification:', error);
    }
  }
}