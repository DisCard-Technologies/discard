"use client"

import { useState, useEffect } from "react"
import { Zap, TrendingUp, Shield, Eye, EyeOff, Sparkles } from "lucide-react"

export function AmbientHome() {
  const [showBalance, setShowBalance] = useState(true)
  const [ambientActions, setAmbientActions] = useState([
    { id: 1, action: "Auto-rebalanced card to $200", time: "Just now", type: "rebalance" },
    { id: 2, action: "Yield optimized +$12.84", time: "2h ago", type: "yield" },
    { id: 3, action: "Gas saved on 3 transactions", time: "4h ago", type: "optimization" },
  ])

  // Simulate ambient actions happening in background
  useEffect(() => {
    const interval = setInterval(() => {
      setAmbientActions((prev) => [
        {
          id: Date.now(),
          action: "Yield compounded +$0.42",
          time: "Just now",
          type: "yield",
        },
        ...prev.slice(0, 4),
      ])
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="h-full flex flex-col px-6 pt-16 pb-4">
      {/* Status indicator - minimal, ambient */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] text-muted-foreground font-medium tracking-[0.2em] uppercase">
            All Systems Nominal
          </span>
        </div>
        <button
          onClick={() => setShowBalance(!showBalance)}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {showBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Net Worth - the only "dashboard" element */}
      <div className="flex-1 flex flex-col items-center justify-center -mt-20">
        <p className="text-xs text-muted-foreground mb-3 tracking-[0.3em] uppercase">Net Worth</p>
        <h1 className="text-6xl font-extralight tracking-tight mb-3">{showBalance ? "$178,171" : "••••••"}</h1>
        <div className="flex items-center gap-2 text-primary">
          <TrendingUp className="w-4 h-4" />
          <span className="text-sm font-medium">+4.96% today</span>
        </div>

        {/* Ambient Finance indicator */}
        <div className="mt-8 flex items-center gap-2 px-4 py-2 rounded-full glass-card">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs text-muted-foreground">Ambient finance active</span>
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        </div>
      </div>

      {/* Ambient Activity Feed - what's happening in the background */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-muted-foreground tracking-[0.2em] uppercase">Background Activity</span>
        </div>
        {ambientActions.slice(0, 3).map((action) => (
          <div key={action.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  action.type === "yield" ? "bg-primary" : action.type === "rebalance" ? "bg-accent" : "bg-chart-3"
                }`}
              />
              <span className="text-xs text-muted-foreground">{action.action}</span>
            </div>
            <span className="text-[10px] text-muted-foreground/60">{action.time}</span>
          </div>
        ))}
      </div>

      {/* Declarative Goals - 2035 style */}
      <div className="mt-6 glass-card rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium">Active Goals</span>
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>"Keep card at $200"</span>
            <span className="text-primary text-xs">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span>"Maximize yield on idle USDC"</span>
            <span className="text-primary text-xs">+$847/mo</span>
          </div>
        </div>
      </div>
    </div>
  )
}
