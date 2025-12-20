"use client"

import { useState } from "react"
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Layers,
  Target,
  Sparkles,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from "lucide-react"

type TabType = "tokens" | "assets" | "predictions"

interface Token {
  symbol: string
  name: string
  balance: string
  value: number
  change: number
  icon: string
  isAmbientManaged?: boolean
}

interface Asset {
  name: string
  type: "nft" | "rwa" | "depin"
  value: number
  change: number
  image: string
}

interface Prediction {
  question: string
  position: "yes" | "no"
  shares: number
  avgPrice: number
  currentPrice: number
  expiresIn: string
  market: string
}

const tokens: Token[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    balance: "12.847",
    value: 48234.12,
    change: 5.23,
    icon: "◇",
    isAmbientManaged: true,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    balance: "45,892.00",
    value: 45892.0,
    change: 0.01,
    icon: "◈",
    isAmbientManaged: true,
  },
  { symbol: "BTC", name: "Bitcoin", balance: "0.8421", value: 71284.67, change: 3.89, icon: "₿" },
  { symbol: "SOL", name: "Solana", balance: "234.5", value: 8421.45, change: -2.14, icon: "◎" },
  { symbol: "ARB", name: "Arbitrum", balance: "12,450", value: 2847.23, change: 8.92, icon: "⬡" },
  { symbol: "LINK", name: "Chainlink", balance: "892.3", value: 1591.87, change: -1.23, icon: "⬢" },
]

const assets: Asset[] = [
  { name: "Bored Ape #7284", type: "nft", value: 42500, change: -8.2, image: "/bored-ape-nft-pixel-art.jpg" },
  { name: "Manhattan RE Token", type: "rwa", value: 25000, change: 2.1, image: "/manhattan-building-token.jpg" },
  { name: "Helium Hotspot #12847", type: "depin", value: 3200, change: 15.4, image: "/helium-hotspot-device.png" },
  { name: "CryptoPunk #4821", type: "nft", value: 89000, change: 1.8, image: "/cryptopunk-pixel-avatar.jpg" },
]

const predictions: Prediction[] = [
  {
    question: "ETH > $5k by March 2025?",
    position: "yes",
    shares: 500,
    avgPrice: 0.42,
    currentPrice: 0.68,
    expiresIn: "47d",
    market: "Polymarket",
  },
  {
    question: "US Spot ETH ETF Approved Q1?",
    position: "yes",
    shares: 1200,
    avgPrice: 0.31,
    currentPrice: 0.74,
    expiresIn: "23d",
    market: "Polymarket",
  },
  {
    question: "BTC ATH in December?",
    position: "no",
    shares: 300,
    avgPrice: 0.78,
    currentPrice: 0.45,
    expiresIn: "12d",
    market: "Kalshi",
  },
  {
    question: "Fed Rate Cut > 50bps?",
    position: "yes",
    shares: 800,
    avgPrice: 0.55,
    currentPrice: 0.62,
    expiresIn: "8d",
    market: "Kalshi",
  },
]

export function PortfolioHoldings() {
  const [activeTab, setActiveTab] = useState<TabType>("tokens")

  const totalTokens = tokens.reduce((acc, t) => acc + t.value, 0)
  const totalAssets = assets.reduce((acc, a) => acc + a.value, 0)
  const totalPredictions = predictions.reduce((acc, p) => acc + p.shares * p.currentPrice, 0)

  return (
    <div className="h-full flex flex-col px-4 pt-12 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">Holdings</h1>
          <p className="text-xs text-muted-foreground mt-1">$178,271.34 total value</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-card">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-muted-foreground">AI Optimizing</span>
        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "tokens" as TabType, label: "Tokens", icon: Layers, value: totalTokens },
          { id: "assets" as TabType, label: "Assets", icon: Target, value: totalAssets },
          { id: "predictions" as TabType, label: "Markets", icon: BarChart3, value: totalPredictions },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 px-3 rounded-xl transition-all ${
                isActive ? "glass-card bg-primary/10 border-primary/20" : "bg-secondary/20 hover:bg-secondary/40"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                  {tab.label}
                </span>
              </div>
              <span className={`text-[10px] ${isActive ? "text-primary" : "text-muted-foreground/70"}`}>
                ${tab.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {activeTab === "tokens" && (
          <>
            {tokens.map((token) => (
              <div
                key={token.symbol}
                className="flex items-center justify-between p-3 rounded-xl glass-card hover:bg-secondary/30 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center text-lg">
                    {token.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{token.symbol}</span>
                      {token.isAmbientManaged && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10">
                          <Sparkles className="w-2.5 h-2.5 text-primary" />
                          <span className="text-[8px] text-primary font-medium">AUTO</span>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {token.balance} {token.symbol}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-sm font-medium">${token.value.toLocaleString()}</span>
                    <div
                      className={`flex items-center justify-end gap-0.5 ${token.change >= 0 ? "text-primary" : "text-destructive"}`}
                    >
                      {token.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span className="text-xs">{Math.abs(token.change)}%</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === "assets" && (
          <>
            {/* Asset Type Pills */}
            <div className="flex gap-2 mb-2">
              {["All", "NFTs", "RWA", "DePIN"].map((type) => (
                <button
                  key={type}
                  className={`px-3 py-1 rounded-full text-xs transition-all ${
                    type === "All"
                      ? "bg-primary/20 text-primary"
                      : "bg-secondary/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {assets.map((asset, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-xl glass-card hover:bg-secondary/30 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-secondary/50">
                    <img
                      src={asset.image || "/placeholder.svg"}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <span className="font-medium text-sm">{asset.name}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-medium ${
                          asset.type === "nft"
                            ? "bg-accent/20 text-accent"
                            : asset.type === "rwa"
                              ? "bg-chart-3/20 text-chart-3"
                              : "bg-chart-4/20 text-chart-4"
                        }`}
                      >
                        {asset.type}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-sm font-medium">${asset.value.toLocaleString()}</span>
                    <div
                      className={`flex items-center justify-end gap-0.5 ${asset.change >= 0 ? "text-primary" : "text-destructive"}`}
                    >
                      {asset.change >= 0 ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      <span className="text-xs">{Math.abs(asset.change)}%</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === "predictions" && (
          <>
            {/* Market Stats */}
            <div className="flex gap-2 mb-2">
              <div className="flex-1 p-3 rounded-xl bg-primary/10 border border-primary/20">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Unrealized P&L</span>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-medium text-primary">+$847.23</span>
                </div>
              </div>
              <div className="flex-1 p-3 rounded-xl bg-secondary/30">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Open Positions</span>
                <span className="text-sm font-medium block mt-1">{predictions.length}</span>
              </div>
            </div>

            {predictions.map((pred, idx) => {
              const pnl = (pred.currentPrice - pred.avgPrice) * pred.shares
              const pnlPercent = ((pred.currentPrice - pred.avgPrice) / pred.avgPrice) * 100
              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl glass-card hover:bg-secondary/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 pr-4">
                      <p className="text-sm font-medium leading-snug">{pred.question}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-bold ${
                            pred.position === "yes"
                              ? "bg-primary/20 text-primary"
                              : "bg-destructive/20 text-destructive"
                          }`}
                        >
                          {pred.position}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{pred.market}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px]">{pred.expiresIn}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <div className="flex gap-4">
                      <div>
                        <span className="text-[9px] text-muted-foreground uppercase">Shares</span>
                        <p className="text-xs font-medium">{pred.shares}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-muted-foreground uppercase">Avg</span>
                        <p className="text-xs font-medium">${pred.avgPrice.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-muted-foreground uppercase">Current</span>
                        <p className="text-xs font-medium">${pred.currentPrice.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className={`text-right ${pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                      <span className="text-sm font-medium">
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </span>
                      <p className="text-[10px]">
                        {pnlPercent >= 0 ? "+" : ""}
                        {pnlPercent.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
