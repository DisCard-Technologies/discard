"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Mic, Send, Sparkles, ArrowUpRight, Repeat, Shield, Zap } from "lucide-react"

const suggestions = [
  { icon: <ArrowUpRight className="w-4 h-4" />, text: "Send 0.5 ETH to alex.eth", type: "transfer" },
  { icon: <Repeat className="w-4 h-4" />, text: "Swap $500 USDC to SOL", type: "swap" },
  { icon: <Shield className="w-4 h-4" />, text: "Enable DeFi auto-yield", type: "ambient" },
  { icon: <Zap className="w-4 h-4" />, text: "Bridge to Arbitrum", type: "bridge" },
]

const recentIntents = [
  { intent: "Sent 2.5 ETH to vitalik.eth", status: "completed", time: "2h ago" },
  { intent: "Auto-compounded yield +$42.18", status: "ambient", time: "4h ago" },
  { intent: "Swapped 1000 USDC → 0.24 ETH", status: "completed", time: "1d ago" },
]

export function CommandCenter() {
  const [input, setInput] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    // Process intent
    console.log("Processing intent:", input)
    setInput("")
  }

  const handleSuggestionClick = (text: string) => {
    setInput(text)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center py-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Intent Engine Active</span>
        </div>
        <h1 className="text-2xl font-light mb-2">What would you like to do?</h1>
        <p className="text-sm text-muted-foreground">Express your intent naturally. I'll handle the rest.</p>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="glass-card rounded-2xl p-2 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setShowSuggestions(e.target.value === "")
            }}
            placeholder="Send, swap, stake, bridge..."
            className="flex-1 bg-transparent px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setIsListening(!isListening)}
            className={`p-3 rounded-xl transition-all ${
              isListening ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {isListening && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-sm text-primary">
            <div className="flex gap-1">
              <span className="w-1 h-3 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-4 bg-primary rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
              <span className="w-1 h-5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "450ms" }} />
            </div>
            Listening...
          </div>
        )}
      </form>

      {/* Suggestions */}
      {showSuggestions && (
        <div className="space-y-2 mt-8">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Suggestions</p>
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSuggestionClick(suggestion.text)}
              className="w-full glass-card rounded-xl p-4 flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-primary">
                {suggestion.icon}
              </div>
              <span>{suggestion.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* Recent Intents */}
      <div className="space-y-3 mt-6">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Recent Activity</p>
        {recentIntents.map((item, i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  item.status === "ambient" ? "bg-accent animate-pulse" : "bg-primary"
                }`}
              />
              <span className="text-sm">{item.intent}</span>
            </div>
            <span className="text-xs text-muted-foreground">{item.time}</span>
          </div>
        ))}
      </div>

      {/* Ambient Finance Card */}
      <div className="glass-card rounded-2xl p-4 glow-primary">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">Ambient Finance Active</p>
            <p className="text-sm text-muted-foreground">Auto-optimizing your yields</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Earned this month</span>
          <span className="text-primary font-medium">+$847.32</span>
        </div>
      </div>
    </div>
  )
}
