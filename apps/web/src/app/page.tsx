"use client"

import Image from "next/image"
import Header from "../components/layout/Header"
import Button from "../components/ui/Button"
import CryptoCard from "../components/cards/CryptoCard"
import Section from "../components/layout/Section"
import { Hero } from "../components/sections/Hero"
import { TrustedBy } from "../components/sections/TrustedBy"
import { CryptoCoins } from "../components/sections/CryptoCoins"
import { Features } from "../components/sections/Features"
import { Stats } from "../components/sections/Stats"

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
      <Section className="self-stretch flex flex-col items-center justify-center py-72 gap-40">
        <div className="self-stretch flex flex-col items-center justify-start gap-12">
          <p className="relative text-16 tracking-[-0.02em] leading-[120%] font-medium text-gray-400">
            We deliver <span className="text-lightgreen-100">best solution</span>
          </p>
          <h2 className="relative text-40 tracking-[-0.01em] leading-[120%] font-medium text-center">
            One application with multiple options to give<br />
            you freedom of buying & selling
          </h2>
        </div>
        <div className="self-stretch relative h-[840px]">
          <div className="absolute top-[-0.53px] left-[255px] w-[690px] h-[707.7px] text-center text-12 text-lightgreen-100">
            {/* <Image className="absolute top-0 left-0 w-[690px] h-[690px]" width={690} height={690} sizes="100vw" alt="" src="Group 46.svg" /> */}
            <div className="absolute top-[255.8px] left-[83px] w-[197.2px] h-[197.2px] overflow-hidden flex items-center justify-center">
              {/* <Image
                className="w-full h-full object-cover scale-[1.061]"
                width={197.2}
                height={197.2}
                sizes="100vw"
                alt=""
                src="image 5.png"
              /> */}
            </div>
            {/* iPhone mockup - simplified structure */}
            <div className="absolute top-[32.6px] left-[178.25px] w-[331.5px] h-[675.1px]">
              {/* Phone frame and screen content */}
              {/* <Image className="absolute" width={327.4} height={675.1} sizes="100vw" alt="" src="Device Most Outer Border.png" /> */}
              {/* Add other phone elements as needed */}
            </div>
            {/* <Image className="absolute top-[219.68px] left-[396.3px] w-[216.9px] h-[216.9px] object-contain" width={216.9} height={216.9} sizes="100vw" alt="" src="image 6.png" /> */}
          </div>
          {/* Feature points */}
          <div className="absolute top-[154.27px] left-[822px] flex flex-row items-start justify-start gap-12">
            {/* <Image className="w-48 rounded-full h-48" width={48} height={48} sizes="100vw" alt="" src="Frame 51.svg" /> */}
            <div className="flex flex-col items-start justify-center gap-2">
              <h4 className="relative text-20 tracking-[-0.01em] leading-[120%] font-medium">Refinement</h4>
              <p className="relative text-16 leading-[140%] text-gray-400 whitespace-pre-line">
                Refine & improve your<br />
                crypto landing page
              </p>
            </div>
          </div>
          {/* Add other feature points similarly */}
        </div>
      </Section>

      {/* CTA Section */}
      <Section className="self-stretch flex flex-col items-center justify-center px-[50px] py-72">
        <div className="w-[1200px] shadow-crypto backdrop-blur-[6px] rounded-16 bg-gray-500 border border-gray-700 overflow-hidden flex flex-row items-center justify-between p-[64px] relative">
          <div className="flex flex-col items-start justify-start gap-12 z-0">
            <h2 className="relative text-40 tracking-[-0.01em] leading-[120%] font-medium">
              Crypgo powered by framer platform
            </h2>
            <p className="relative text-16 leading-[140%] text-gray-400">
              Our landing page empower framer developers to have free, safer<br />
              and more trustworthy experiences
            </p>
          </div>
          <Button className="btn-primary gap-8 z-[1]">
            <span className="relative leading-[140%] font-semibold">Get template</span>
            {/* <Image className="w-20 relative max-h-full" width={20} height={20} sizes="100vw" alt="" src="Right arrow.svg" /> */}
          </Button>
          <div className="w-[591.3px] absolute -top-[179.73px] left-[760px] h-[591.3px] opacity-5 overflow-hidden flex items-center justify-center z-[2]">
            {/* <Image
              className="w-full h-full object-cover"
              width={591.3}
              height={591.3}
              sizes="100vw"
              alt=""
              src="Frame 11.png"
            /> */}
          </div>
        </div>
      </Section>

      {/* Portfolio Section */}
      <Section className="self-stretch flex flex-row items-center justify-between px-[50px] py-72 gap-0">
        <div className="w-[588px] relative h-[500px]">
          {/* Portfolio visualization - simplified */}
          <div className="relative w-full h-full">
            {/* <Image className="absolute" width={256.7} height={257.5} sizes="100vw" alt="" src="Group 58.png" />
            <Image className="absolute" width={256.7} height={257.5} sizes="100vw" alt="" src="Group 57.png" /> */}
            {/* Add portfolio cards */}
          </div>
        </div>
        <div className="w-[585px] flex flex-col items-start justify-start gap-40 pl-32">
          <div className="self-stretch flex flex-col items-start justify-start gap-12">
            <h3 className="relative text-20 tracking-[-0.01em] leading-[120%] font-medium">
              Crypto landing page <span className="text-lightgreen-100">template</span>
            </h3>
            <h2 className="relative text-40 tracking-[-0.01em] leading-[120%] font-medium">
              Create your cryptocurrency<br />
              portfolio today
            </h2>
            <p className="self-stretch relative text-16 leading-[140%] text-gray-400">
              Coinbase has a variety of features that make it the best place<br />
              to start trading.
            </p>
          </div>
          <div className="self-stretch flex flex-col items-start justify-start gap-20">
            {["Manage your portfolio", "Vault protection", "Mobile apps"].map((feature, index) => (
              <div key={index}>
                <div className="self-stretch flex flex-row items-center justify-start gap-16">
                  {/* <Image className="w-48 h-48 rounded-full" width={48} height={48} sizes="100vw" alt="" src="Frame 51.svg" /> */}
                  <span className="relative text-20 tracking-[-0.01em] leading-[120%] font-medium">{feature}</span>
                </div>
                {index < 2 && <div className="self-stretch relative border-t border-gray-700 h-px mt-20" />}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Upgrade Section with Charts */}
      <Section className="self-stretch flex flex-row items-center justify-between px-[50px] py-72 gap-0">
        <div className="w-[585px] flex flex-col items-start justify-start gap-40">
          <div className="self-stretch flex flex-col items-start justify-start gap-12">
            <h3 className="relative text-20 tracking-[-0.01em] leading-[120%] font-medium">
              Crypgo <span className="text-lightgreen-100">upgrade</span>
            </h3>
            <div className="self-stretch flex flex-col items-start justify-start gap-12">
              <h2 className="relative text-40 tracking-[-0.01em] leading-[120%] font-medium">
                Upgrade your crypto business
              </h2>
              <p className="self-stretch relative text-16 leading-[140%] text-gray-400">
                Get faster, safer, more affordable cloud object storage with<br />
                no centeral point of failure.
              </p>
            </div>
          </div>
          <div className="self-stretch flex flex-row items-start justify-start gap-40">
            <div className="flex flex-col items-start justify-start gap-20">
              {["100% secure", "A fraction of the cost", "More durable", "Easier to use"].map((item, index) => (
                <div key={index} className="flex flex-row items-center justify-start gap-12">
                  {/* <Image className="w-20 relative max-h-full" width={20} height={20} sizes="100vw" alt="" src="Frame.svg" /> */}
                  <span className="relative tracking-[-0.02em] leading-[120%] font-medium">{item}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-start justify-start gap-20">
              {["Free figma file", "Powerful in performance", "Designed for crypto", "100% free framer template"].map((item, index) => (
                <div key={index} className="flex flex-row items-center justify-start gap-12">
                  {/* <Image className="w-20 relative max-h-full" width={20} height={20} sizes="100vw" alt="" src="Frame.svg" /> */}
                  <span className="relative tracking-[-0.02em] leading-[120%] font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="w-[587px] relative h-[517px]">
          {/* Chart section - simplified */}
          <div className="absolute top-[85px] left-[52px] shadow-crypto backdrop-blur-32 rounded-16 bg-gray-500 border border-gray-700 w-[522px] flex flex-col items-start justify-start p-32 gap-32">
            {/* Add chart content */}
          </div>
        </div>
      </Section>

      {/* Support Section */}
      <Section className="self-stretch flex flex-col items-center justify-start px-[50px] py-72 gap-40">
        <div className="self-stretch flex flex-col items-center justify-center gap-12">
          <p className="relative text-16 tracking-[-0.02em] leading-[120%] font-medium text-gray-400">
            Always by <span className="text-lightgreen-100">your side</span>
          </p>
          <div className="self-stretch flex flex-col items-center justify-center gap-12">
            <h2 className="relative text-40 tracking-[-0.01em] leading-[120%] font-medium">
              Be the first to use our Crypgo!
            </h2>
            <p className="relative text-16 leading-[140%] text-gray-400 text-center">
              Get faster, safer, more affordable cloud object storage with<br />
              no centeral point of failure.
            </p>
          </div>
        </div>
        <div className="self-stretch shadow-crypto backdrop-blur-32 rounded-16 bg-gray-500 border border-gray-700 overflow-hidden flex flex-col items-center justify-center pt-72 pb-0">
          <div className="self-stretch relative h-[220px] overflow-hidden">
            {/* <Image className="absolute" width={1211} height={195.9} sizes="100vw" alt="" src="Vector.svg" />
            <Image className="absolute" width={1212} height={201} sizes="100vw" alt="" src="Vector.svg" /> */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[996px] flex flex-row items-center justify-between">
              {[
                { title: "24/7 Support", desc: "Need help? Get your requests\nsolved quickly via support team." },
                { title: "Community", desc: "Join the conversations on our\nworldwide OKEx communities" },
                { title: "Academy", desc: "Learn blockchain and\ncrypto for free." }
              ].map((item, index) => (
                <div key={index} className="w-[240px] flex flex-col items-center justify-start gap-20">
                  {/* <Image className="w-[64px] rounded-full h-[64px]" width={64} height={64} sizes="100vw" alt="" src={index === 0 ? "Frame 51.svg" : "Frame 94.svg"} /> */}
                  <div className="self-stretch flex flex-col items-center justify-center gap-8">
                    <h4 className="relative text-20 tracking-[-0.01em] leading-[120%] font-medium">{item.title}</h4>
                    <p className="relative text-16 leading-[140%] text-gray-400 text-center whitespace-pre-line">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* FAQ Section */}
      <Section className="self-stretch flex flex-col items-center justify-start px-[50px] py-72 gap-40">
        <div className="self-stretch flex flex-col items-center justify-start gap-8">
          <p className="relative text-16 tracking-[-0.02em] leading-[120%] font-medium text-gray-400">
            Popular <span className="text-lightgreen-100">questions</span>
          </p>
          <div className="self-stretch flex flex-col items-center justify-center gap-12">
            <h2 className="relative text-40 tracking-[-0.01em] leading-[120%] font-medium">
              Learn more about Crypgo
            </h2>
            <p className="relative text-16 leading-[140%] text-gray-400 text-center">
              We accept 100+ cryptocurrencies around the world
            </p>
          </div>
        </div>
        <div className="w-[992px] flex flex-col items-start justify-start gap-20">
          {[
            "What is Crypgo?",
            "Is Crypgo available worldwide?",
            "Which cryptocurrencies are supported on Crypgo?",
            "Is my personal information secure with Crypgo?",
            "Are there any deposit or withdrawal fees?",
            "Does Crypgo offer advanced trading tools?"
          ].map((question, index) => (
            <div key={index} className="w-full rounded-16 overflow-hidden flex flex-col items-start justify-start">
              <div className="self-stretch bg-gray-500 flex flex-row items-center justify-between px-24 py-16">
                <span className="relative text-20 tracking-[-0.01em] leading-[120%] font-medium">{question}</span>
                {/* <Image className="w-32 h-32" width={32} height={32} sizes="100vw" alt="" src="Frame 169.svg" /> */}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Footer */}
      <footer className="self-stretch bg-crypto-dark flex flex-col items-start justify-start px-[50px] text-gray-400">
        <div className="self-stretch flex flex-row items-center justify-between py-[80px] gap-0">
          <div className="w-[486px] flex flex-col items-start justify-start gap-24">
            <div className="self-stretch flex flex-col items-start justify-start gap-24">
              <div className="bg-crypto-dark flex flex-row items-center justify-start gap-10">
                {/* <Image className="w-32 relative h-32" width={32} height={32} sizes="100vw" alt="" src="Frame 11.svg" />
                <Image className="w-[93px] relative h-32" width={93} height={32} sizes="100vw" alt="" src="Frame 12.svg" /> */}
              </div>
              <p className="self-stretch relative text-16 leading-[140%]">
                Transform your crypto business with Crypgo<br />
                Framer, a template for startups and blockchain services.
              </p>
            </div>
            <div className="flex flex-row items-center justify-start flex-wrap gap-8">
              {[1, 2, 3].map((_, index) => (
                <Image key={index} className="w-[38px] rounded-full h-[38px]" width={38} height={38} sizes="100vw" alt="" src={`Frame 19${4 + index}.svg`} />
              ))}
            </div>
          </div>
          <div className="flex flex-row items-start justify-start gap-[80px] text-20 text-white">
            <div className="flex flex-col items-start justify-start gap-12">
              <h4 className="relative tracking-[-0.01em] leading-[120%] font-medium">Links</h4>
              <div className="flex flex-col items-start justify-start gap-8 text-16 text-gray-400">
                {["Features", "Benefits", "Services", "Why Crypgo", "FAQs"].map((link, index) => (
                  <a key={index} className="relative leading-[140%] hover:text-lightgreen-100 transition-colors cursor-pointer">{link}</a>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-start justify-start gap-12">
              <h4 className="relative tracking-[-0.01em] leading-[120%] font-medium">Other Pages</h4>
              <div className="flex flex-col items-start justify-start gap-8 text-16 text-gray-400">
                {["Terms", "Disclosures", "Latest News"].map((link, index) => (
                  <a key={index} className="relative leading-[140%] hover:text-lightgreen-100 transition-colors cursor-pointer">{link}</a>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-start justify-start gap-16">
              <h4 className="relative tracking-[-0.01em] leading-[120%] font-medium">Download app</h4>
              <div className="self-stretch flex flex-col items-start justify-center gap-16">
                {/* <Image className="w-[132.8px] rounded-[6.77px] h-[44px]" width={132.8} height={44} sizes="100vw" alt="" src="Frame 26.svg" />
                <Image className="w-[129.2px] rounded-[7.38px] h-[48px]" width={129.2} height={48} sizes="100vw" alt="" src="Frame 27.svg" /> */}
              </div>
            </div>
          </div>
        </div>
        <div className="self-stretch border-t border-gray-300 flex flex-row items-center justify-center px-8 py-32 text-14 text-gray-200">
          <p className="relative leading-[140%]">Copyright ©2025 Crypgo. All rights reserved</p>
        </div>
      </footer>
    </div>
  )
}