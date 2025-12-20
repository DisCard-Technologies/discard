"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Mic, Send, Sparkles, Camera, X, Loader2 } from "lucide-react"

interface CommandBarProps {
  onHighValueIntent: () => void
}

const suggestions = [
  "Keep my card balance at $200",
  "Send $50 to alex.eth",
  "What's my yield this month?",
  "Show me suspicious activity",
]

export function CommandBar({ onHighValueIntent }: CommandBarProps) {
  const [input, setInput] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [lastResponse, setLastResponse] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const intent = input.toLowerCase()
    setIsProcessing(true)
    setShowSuggestions(false)

    // Simulate intent processing
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Check for high-value intents
    if (intent.includes("send") && (intent.includes("$") || intent.includes("eth"))) {
      const amount = Number.parseFloat(intent.match(/\$?(\d+)/)?.[1] || "0")
      if (amount > 100) {
        onHighValueIntent()
        setInput("")
        setIsProcessing(false)
        return
      }
    }

    // Declarative goal setting
    if (intent.includes("keep") || intent.includes("maintain") || intent.includes("auto")) {
      setLastResponse("Goal set. I'll handle this automatically.")
    } else if (intent.includes("yield") || intent.includes("earning")) {
      setLastResponse("You've earned $847.32 this month from ambient yield optimization.")
    } else {
      setLastResponse("Processing your intent...")
    }

    setInput("")
    setIsProcessing(false)

    // Clear response after a few seconds
    setTimeout(() => setLastResponse(null), 4000)
  }

  const handleSuggestionClick = (text: string) => {
    setInput(text)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative z-20 px-4 pb-2">
      {/* Response bubble */}
      {lastResponse && (
        <div className="absolute bottom-full left-4 right-4 mb-2 p-3 rounded-2xl glass-card border-primary/20 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary mt-0.5" />
            <p className="text-sm text-foreground">{lastResponse}</p>
          </div>
        </div>
      )}

      {/* Suggestions */}
      {showSuggestions && (
        <div className="absolute bottom-full left-4 right-4 mb-2 p-2 rounded-2xl glass-card">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest px-2 mb-2">Try saying</p>
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full text-left px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              "{suggestion}"
            </button>
          ))}
        </div>
      )}

      {/* Main Command Bar */}
      <div className="glass-card rounded-2xl p-1.5 flex items-center gap-1.5 glow-primary">
        <button
          type="button"
          className="p-3 rounded-xl hover:bg-secondary/50 transition-colors text-muted-foreground"
          title="Scan bill or invoice"
        >
          <Camera className="w-5 h-5" />
        </button>

        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="What would you like to do?"
            className="flex-1 bg-transparent px-2 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none text-sm"
          />

          {input && (
            <button
              type="button"
              onClick={() => setInput("")}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={() => setIsListening(!isListening)}
          className={`p-3 rounded-xl transition-all ${
            isListening
              ? "bg-primary text-primary-foreground animate-pulse"
              : "hover:bg-secondary/50 text-muted-foreground"
          }`}
        >
          <Mic className="w-5 h-5" />
        </button>

        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isProcessing}
          className="p-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all"
        >
          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>

      {/* Listening indicator */}
      {isListening && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 text-sm text-primary">
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-1 bg-primary rounded-full animate-pulse"
                style={{
                  height: `${12 + Math.random() * 8}px`,
                  animationDelay: `${i * 100}ms`,
                }}
              />
            ))}
          </div>
          <span className="text-xs">Listening...</span>
        </div>
      )}
    </div>
  )
}
