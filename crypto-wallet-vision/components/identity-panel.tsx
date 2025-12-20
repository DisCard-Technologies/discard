"use client"

import { useState } from "react"
import { Shield, Key, Fingerprint, Globe, Check, ChevronRight, QrCode, Copy, ExternalLink, Lock } from "lucide-react"

const credentials = [
  { name: "Proof of Humanity", issuer: "WorldID", verified: true, icon: <Fingerprint className="w-5 h-5" /> },
  { name: "KYC Verification", issuer: "Verified Inc.", verified: true, icon: <Shield className="w-5 h-5" /> },
  { name: "Credit Score", issuer: "On-Chain Credit", verified: true, icon: <Check className="w-5 h-5" /> },
  { name: "ENS Domain", issuer: "Ethereum", verified: true, icon: <Globe className="w-5 h-5" /> },
]

const connectedApps = [
  { name: "Uniswap", permissions: ["Read balance", "Execute swaps"], lastUsed: "2h ago" },
  { name: "Aave", permissions: ["Read balance", "Lending"], lastUsed: "1d ago" },
]

export function IdentityPanel() {
  const [showQR, setShowQR] = useState(false)

  return (
    <div className="px-6 pt-12 pb-4 space-y-6">
      {/* Identity Card */}
      <div className="glass-card rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                <Fingerprint className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-medium">alex.sovereign</h2>
                <p className="text-xs text-muted-foreground">Self-Sovereign Identity</p>
              </div>
            </div>
            <button
              onClick={() => setShowQR(!showQR)}
              className="p-2 rounded-xl glass hover:bg-secondary/50 transition-colors"
            >
              <QrCode className="w-5 h-5" />
            </button>
          </div>

          {showQR ? (
            <div className="flex flex-col items-center py-4">
              <div className="w-40 h-40 bg-foreground rounded-2xl p-3 mb-3">
                <div className="w-full h-full bg-background rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-xs">QR Code</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Scan to verify identity</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/20 text-primary text-xs font-medium">
                  <Shield className="w-3 h-3" />
                  Self-Custody
                </div>
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-accent/20 text-accent text-xs font-medium">
                  <Key className="w-3 h-3" />
                  ZK-Verified
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono">0x8f3...7d4e</span>
                <button className="hover:text-foreground transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
                <button className="hover:text-foreground transition-colors">
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Privacy by Default - 2035 feature */}
      <div className="glass-card rounded-2xl p-4 border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">Cryptographic Isolation</p>
            <p className="text-xs text-muted-foreground">Card context isolated by default</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        </div>
      </div>

      {/* Verifiable Credentials */}
      <div className="space-y-3">
        <h3 className="text-xs text-muted-foreground uppercase tracking-widest">Verifiable Credentials</h3>
        {credentials.map((cred, i) => (
          <div key={i} className="glass-card rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                {cred.icon}
              </div>
              <div>
                <p className="font-medium text-sm">{cred.name}</p>
                <p className="text-[10px] text-muted-foreground">by {cred.issuer}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {cred.verified && (
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary" />
                </div>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>

      {/* Connected Apps */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs text-muted-foreground uppercase tracking-widest">Connected Apps</h3>
          <button className="text-xs text-primary">Manage</button>
        </div>
        {connectedApps.map((app, i) => (
          <div key={i} className="glass-card rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-sm">{app.name}</p>
              <span className="text-[10px] text-muted-foreground">{app.lastUsed}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {app.permissions.map((perm, j) => (
                <span key={j} className="px-2 py-0.5 rounded-md bg-secondary text-[10px] text-muted-foreground">
                  {perm}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
