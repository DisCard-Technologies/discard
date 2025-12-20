"use client"

import { Home, CreditCard, Fingerprint, Layers, ArrowLeftRight } from "lucide-react"

interface NavBarProps {
  activeView: "ambient" | "portfolio" | "transfer" | "card" | "identity"
  onViewChange: (view: "ambient" | "portfolio" | "transfer" | "card" | "identity") => void
}

const navItems = [
  { id: "ambient" as const, icon: Home, label: "Home" },
  { id: "portfolio" as const, icon: Layers, label: "Holdings" },
  { id: "transfer" as const, icon: ArrowLeftRight, label: "Transfer" },
  { id: "card" as const, icon: CreditCard, label: "Card" },
  { id: "identity" as const, icon: Fingerprint, label: "Identity" },
]

export function NavBar({ activeView, onViewChange }: NavBarProps) {
  return (
    <div className="relative z-10 p-3 pb-6">
      <nav className="flex items-center justify-center gap-2">
        {navItems.map((item) => {
          const isActive = activeView === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex items-center gap-2 py-2 px-4 rounded-full transition-all ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
              }`}
            >
              <Icon className="w-4 h-4" />
              {isActive && <span className="text-xs font-medium">{item.label}</span>}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
