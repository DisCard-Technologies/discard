"use client"

import { Zap, Shield, Wifi } from "lucide-react"

export function AmbientStatus() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <span className="text-xs text-muted-foreground font-medium tracking-wide">AMBIENT ACTIVE</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Shield className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Wifi className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Zap className="w-3.5 h-3.5 text-chart-3" />
          <span className="text-xs">98%</span>
        </div>
      </div>
    </div>
  )
}
