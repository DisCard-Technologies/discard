"use client"

import Header from "../components/layout/Header"
import { Hero } from "../components/sections/Hero"
import { TrustedBy } from "../components/sections/TrustedBy"
import { CryptoCoins } from "../components/sections/CryptoCoins"
import { Features } from "../components/sections/Features"
import { Stats } from "../components/sections/Stats"
import { MobileApp } from "../components/sections/Mobile"
import { CTA } from "../components/sections/CTA"
import { Portfolio } from "../components/sections/Portfolio"
import { Upgrade } from "../components/sections/Upgrade"
import { Support } from "../components/sections/Support"
import { FAQ } from "../components/sections/FAQ"
import { Footer } from "../components/layout/Footer"

export default function Home() {
  const cryptoCoins = [
    { label: "Highest volume", name: "Bitcoin", price: "93575.5" },
    { label: "Top gainer", name: "Ethereum", price: "3337.28" },
    { label: "New listing", name: "Litecoin", price: "105.000" },
    { label: "Most traded", name: "Polkadot", price: "6.6423" },
    { label: "Biggest gainers", name: "Solana", price: "189.63" },
    { label: "Trending", name: "Chainlink", price: "19.991" }
  ]

  return (
    <div className="w-full relative flex flex-col items-start justify-start text-left text-16 text-white font-sans bg-crypto-bg min-h-screen">
      {/* Header */}
      <Header />

      {/* Hero Section */}
      <Hero />

      {/* Trusted by Section */}
      <TrustedBy />

      {/* Featured Crypto Coins */}
      <CryptoCoins />

      {/* Features - Why Choose Discard Section */}
      <Features />

      {/* Stats Section */}
      <Stats />

      {/* Mobile App Section */}
      <MobileApp />

      {/* CTA Section */}
      <CTA />

      {/* Portfolio Section */}
      <Portfolio />

      {/* Upgrade Section with Charts */}
      <Upgrade />

      {/* Support Section */}
      <Support />

      {/* FAQ Section */}
      <FAQ />

      {/* Footer */}
      <Footer />
    </div>
  )
}