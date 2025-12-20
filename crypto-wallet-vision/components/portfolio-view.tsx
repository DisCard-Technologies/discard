"use client"

import { useState } from "react"
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft, Repeat } from "lucide-react"
import { Button } from "@/components/ui/button"

const assets = [
  {
    symbol: "ETH",
    name: "Ethereum",
    balance: "12.4582",
    value: "$48,291.04",
    change: "+5.2%",
    positive: true,
    icon: "◆",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    balance: "0.8421",
    value: "$71,842.18",
    change: "+2.8%",
    positive: true,
    icon: "₿",
  },
  {
    symbol: "SOL",
    name: "Solana",
    balance: "284.12",
    value: "$42,618.00",
    change: "-1.4%",
    positive: false,
    icon: "◎",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    balance: "15,420.00",
    value: "$15,420.00",
    change: "0.0%",
    positive: true,
    icon: "$",
  },
]

export function PortfolioView() {
  const [selectedPeriod, setSelectedPeriod] = useState("1D")
  const periods = ["1D", "1W", "1M", "1Y", "ALL"]

  return (
    <div className="space-y-6">
      {/* Total Balance */}
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground mb-2 tracking-widest uppercase">Net Worth</p>
        <h1 className="text-5xl font-light tracking-tight mb-2">$178,171</h1>
        <div className="flex items-center justify-center gap-2">
          <div className="flex items-center gap-1 text-primary">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-medium">+$8,421.32</span>
          </div>
          <span className="text-muted-foreground text-sm">(+4.96%)</span>
        </div>
      </div>

      {/* Mini Chart */}
      <div className="glass-card rounded-2xl p-4">
        <div className="h-24 flex items-end justify-between gap-1">
          {Array.from({ length: 30 }).map((_, i) => {
            const height = 30 + Math.sin(i * 0.3) * 20 + Math.random() * 30
            return (
              <div
                key={i}
                className="flex-1 bg-primary/30 rounded-t-sm hover:bg-primary/50 transition-colors"
                style={{ height: `${height}%` }}
              />
            )
          })}
        </div>
        <div className="flex justify-between mt-4">
          {periods.map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                selectedPeriod === period
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button className="flex-1 glass-card border-0 hover:bg-secondary/80 h-14 rounded-2xl gap-2">
          <ArrowUpRight className="w-5 h-5 text-primary" />
          <span>Send</span>
        </Button>
        <Button className="flex-1 glass-card border-0 hover:bg-secondary/80 h-14 rounded-2xl gap-2">
          <ArrowDownLeft className="w-5 h-5 text-chart-3" />
          <span>Receive</span>
        </Button>
        <Button className="flex-1 glass-card border-0 hover:bg-secondary/80 h-14 rounded-2xl gap-2">
          <Repeat className="w-5 h-5 text-accent" />
          <span>Swap</span>
        </Button>
      </div>

      {/* Assets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Assets</h2>
          <button className="text-sm text-primary">View All</button>
        </div>
        <div className="space-y-2">
          {assets.map((asset) => (
            <div
              key={asset.symbol}
              className="glass-card rounded-2xl p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-xl">
                  {asset.icon}
                </div>
                <div>
                  <p className="font-medium">{asset.symbol}</p>
                  <p className="text-sm text-muted-foreground">{asset.balance}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium">{asset.value}</p>
                <p
                  className={`text-sm flex items-center justify-end gap-1 ${
                    asset.positive ? "text-primary" : "text-destructive"
                  }`}
                >
                  {asset.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {asset.change}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
