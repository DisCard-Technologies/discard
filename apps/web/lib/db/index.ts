import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Product = 'discard' | 'textpay' | 'both';

export interface WaitlistEntry {
  id?: number;
  name: string;
  email: string;
  company?: string;
  product: 'discard' | 'textpay' | 'both';
  use_case?: string;
  agree_to_updates: boolean;
  ip_address?: string;
  user_agent?: string;
  referrer?: string;
  created_at?: Date;
  updated_at?: Date;
  email_sent?: boolean;
  email_sent_at?: Date;
}

export class WaitlistDB {
  static async create(entry: Omit<WaitlistEntry, 'id' | 'created_at' | 'updated_at'>): Promise<WaitlistEntry> {
    try {
      const result = await prisma.waitlist.create({
        data: {
          name: entry.name,
          email: entry.email,
          company: entry.company || null,
          product: entry.product as Product,
          useCase: entry.use_case || null,
          agreeToUpdates: entry.agree_to_updates,
          ipAddress: entry.ip_address || null,
          userAgent: entry.user_agent || null,
          referrer: entry.referrer || null,
        },
      });
      
      return {
        id: result.id,
        name: result.name,
        email: result.email,
        company: result.company || undefined,
        product: result.product as Product,
        use_case: result.useCase || undefined,
        agree_to_updates: result.agreeToUpdates,
        ip_address: result.ipAddress || undefined,
        user_agent: result.userAgent || undefined,
        referrer: result.referrer || undefined,
        created_at: result.createdAt,
        updated_at: result.updatedAt,
        email_sent: result.emailSent,
        email_sent_at: result.emailSentAt || undefined,
      };
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw new Error('Email already exists in waitlist');
      }
      throw error;
    }
  }

  static async findByEmail(email: string): Promise<WaitlistEntry | null> {
    const result = await prisma.waitlist.findUnique({
      where: { email },
    });
    
    if (!result) return null;

    return {
      id: result.id,
      name: result.name,
      email: result.email,
      company: result.company || undefined,
      product: result.product,
      use_case: result.useCase || undefined,
      agree_to_updates: result.agreeToUpdates,
      ip_address: result.ipAddress || undefined,
      user_agent: result.userAgent || undefined,
      referrer: result.referrer || undefined,
      created_at: result.createdAt,
      updated_at: result.updatedAt,
      email_sent: result.emailSent,
      email_sent_at: result.emailSentAt || undefined,
    };
  }

  static async updateEmailSent(email: string): Promise<void> {
    await prisma.waitlist.update({
      where: { email },
      data: {
        emailSent: true,
        emailSentAt: new Date(),
      },
    });
  }

  static async getStats(): Promise<{
    total: number;
    discard: number;
    textpay: number;
    both: number;
    recent_24h: number;
  }> {
    const [total, productCounts, recent24h] = await Promise.all([
      prisma.waitlist.count(),
      prisma.waitlist.groupBy({
        by: ['product'],
        _count: {
          product: true,
        },
      }),
      prisma.waitlist.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          },
        },
      }),
    ]);

    const productStats = productCounts.reduce((acc: Record<string, number>, item: { product: string; _count: { product: number } }) => {
      acc[item.product as string] = item._count.product;
      return acc;
    }, { discard: 0, textpay: 0, both: 0 });

    return {
      total,
      discard: productStats.discard || 0,
      textpay: productStats.textpay || 0,
      both: productStats.both || 0,
      recent_24h: recent24h,
    };
  }
}

// Ensure Prisma Client is properly closed on process termination
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});