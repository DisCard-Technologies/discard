"use client"

import { Shield, AlertTriangle, Check, MapPin, Clock, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AlertOverlayProps {
  type: "anomaly" | "high-value" | null
  onDismiss: () => void
}

export function AlertOverlay({ type, onDismiss }: AlertOverlayProps) {
  if (type === "anomaly") {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-background/95 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="w-full max-w-sm">
          {/* Alert Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/20 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-medium mb-2">Geographic Anomaly Detected</h2>
            <p className="text-sm text-muted-foreground">AI detected unusual activity pattern</p>
          </div>

          {/* Anomaly Details */}
          <div className="glass-card rounded-2xl p-4 mb-6 space-y-3">
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium">Location Mismatch</p>
                <p className="text-xs text-muted-foreground">Card used in Tokyo, JP - 6,000 miles from your location</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium">Time: 3:42 AM local</p>
                <p className="text-xs text-muted-foreground">Unusual transaction time for your pattern</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DollarSign className="w-4 h-4 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium">Amount: $2,847.00</p>
                <p className="text-xs text-muted-foreground">Electronics Store - Akihabara</p>
              </div>
            </div>
          </div>

          {/* AI Action */}
          <div className="glass-card rounded-2xl p-4 mb-6 border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Auto-Protected</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Card has been automatically frozen. Transaction was blocked.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={onDismiss}
              variant="outline"
              className="flex-1 h-12 rounded-xl glass-card border-0 bg-transparent"
            >
              It was me
            </Button>
            <Button onClick={onDismiss} className="flex-1 h-12 rounded-xl bg-primary">
              <Check className="w-4 h-4 mr-2" />
              Keep Frozen
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (type === "high-value") {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-background/95 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="w-full max-w-sm">
          {/* Confirmation Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-medium mb-2">Confirm High-Value Transfer</h2>
            <p className="text-sm text-muted-foreground">This requires your explicit approval</p>
          </div>

          {/* Transfer Details */}
          <div className="glass-card rounded-2xl p-4 mb-6">
            <div className="text-center mb-4">
              <p className="text-3xl font-light">$500.00</p>
              <p className="text-sm text-muted-foreground">to alex.eth</p>
            </div>
            <div className="h-px bg-border my-4" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Network Fee</span>
              <span>~$0.12</span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-muted-foreground">Estimated Time</span>
              <span>~12 seconds</span>
            </div>
          </div>

          {/* Biometric prompt */}
          <div className="text-center mb-6">
            <p className="text-xs text-muted-foreground">Authenticate to confirm</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={onDismiss}
              variant="outline"
              className="flex-1 h-12 rounded-xl glass-card border-0 bg-transparent"
            >
              Cancel
            </Button>
            <Button onClick={onDismiss} className="flex-1 h-12 rounded-xl bg-primary">
              <Check className="w-4 h-4 mr-2" />
              Confirm
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
