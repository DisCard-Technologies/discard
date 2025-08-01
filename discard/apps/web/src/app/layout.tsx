import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'DisCard - Privacy-first Crypto-backed Disposable Virtual Cards',
  description: 'Secure, disposable virtual cards backed by cryptocurrency',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-6">
                <div className="flex items-center">
                  <h1 className="text-2xl font-bold text-gray-900">
                    DisCard
                  </h1>
                </div>
                <nav className="hidden md:flex space-x-8">
                  <a href="/" className="text-gray-500 hover:text-gray-900">
                    Home
                  </a>
                  <a href="/cards" className="text-gray-500 hover:text-gray-900">
                    Cards
                  </a>
                  <a href="/account" className="text-gray-500 hover:text-gray-900">
                    Account
                  </a>
                </nav>
              </div>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
} 