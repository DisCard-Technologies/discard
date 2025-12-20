"use client"

import { useState } from "react"
import { Eye, EyeOff, Snowflake, Settings, Copy, Check, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

const transactions = [
  { merchant: "Apple Store", amount: "-$1,299.00", date: "Today", category: "Shopping" },
  { merchant: "Auto-Rebalance", amount: "+$200.00", date: "Today", category: "AI", isAmbient: true },
  { merchant: "Whole Foods", amount: "-$127.84", date: "Today", category: "Groceries" },
  { merchant: "Uber", amount: "-$24.50", date: "Yesterday", category: "Transport" },
]

export function VisaCard() {
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cardFrozen, setCardFrozen] = useState(false)

  const copyCardNumber = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="px-6 pt-12 pb-4 space-y-6">
      {/* Card */}
      <div
        className={`relative rounded-3xl p-6 h-52 flex flex-col justify-between overflow-hidden transition-all duration-300 ${
          cardFrozen ? "opacity-60" : ""
        }`}
      >
        {/* Card background */}
        <div className="absolute inset-0 bg-gradient-to-br from-secondary via-card to-muted" />
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        </div>

        {/* Card content */}
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary font-bold text-sm">N</span>
              </div>
              <span className="font-semibold tracking-wide">NEXUS</span>
            </div>
            {cardFrozen && (
              <div className="flex items-center gap-1 text-accent text-sm">
                <Snowflake className="w-4 h-4" />
                Frozen
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3">
            <p className="text-xl tracking-[0.25em] font-mono">
              {showDetails ? "4532 •••• •••• 8847" : "•••• •••• •••• ••••"}
            </p>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Cardholder</p>
              <p className="text-sm font-medium">ALEX SOVEREIGN</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-tight italic text-foreground/80">VISA</p>
            </div>
          </div>
        </div>
      </div>

      {/* Declarative Balance Goal - 2035 style */}
      <div className="glass-card rounded-2xl p-4 border-primary/20">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-primary">Auto-Rebalance Active</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Target Balance</p>
            <p className="text-2xl font-light">$200.00</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Current</p>
            <p className="text-2xl font-light text-primary">$200.00</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          "Keep my card balance at $200" — AI auto-rebalances from your portfolio
        </p>
      </div>

      {/* Card Controls */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={copyCardNumber}
          className="flex-1 glass-card border-0 h-11 rounded-xl gap-2 bg-transparent"
        >
          {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setCardFrozen(!cardFrozen)}
          className={`flex-1 h-11 rounded-xl gap-2 ${cardFrozen ? "bg-accent/20 border-accent" : "glass-card border-0"}`}
        >
          <Snowflake className="w-4 h-4" />
          {cardFrozen ? "Unfreeze" : "Freeze"}
        </Button>
        <Button variant="outline" className="flex-1 glass-card border-0 h-11 rounded-xl gap-2 bg-transparent">
          <Settings className="w-4 h-4" />
          Limits
        </Button>
      </div>

      {/* Transactions */}
      <div className="space-y-3">
        <h2 className="text-xs text-muted-foreground uppercase tracking-widest">Recent</h2>
        <div className="space-y-2">
          {transactions.map((tx, i) => (
            <div
              key={i}
              className={`glass-card rounded-xl p-4 flex items-center justify-between ${tx.isAmbient ? "border-primary/20" : ""}`}
            >
              <div className="flex items-center gap-3">
                {tx.isAmbient && <Zap className="w-4 h-4 text-primary" />}
                <div>
                  <p className="font-medium text-sm">{tx.merchant}</p>
                  <p className="text-xs text-muted-foreground">{tx.date}</p>
                </div>
              </div>
              <p className={`font-medium text-sm ${tx.amount.startsWith("+") ? "text-primary" : ""}`}>{tx.amount}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
