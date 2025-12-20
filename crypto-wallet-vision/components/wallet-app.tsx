"use client"

import { useState, useEffect } from "react"
import { AmbientHome } from "./ambient-home"
import { CommandBar } from "./command-bar"
import { VisaCard } from "./visa-card"
import { IdentityPanel } from "./identity-panel"
import { AlertOverlay } from "./alert-overlay"
import { NavBar } from "./nav-bar"
import { OnboardingFlow } from "./onboarding-flow"
import { PortfolioHoldings } from "./portfolio-holdings"
import { TransferScreen } from "./transfer-screen"

export function WalletApp() {
  const [activeView, setActiveView] = useState<"ambient" | "portfolio" | "transfer" | "card" | "identity">("ambient")
  const [showAlert, setShowAlert] = useState(false)
  const [alertType, setAlertType] = useState<"anomaly" | "high-value" | null>(null)
  const [isFirstOpen, setIsFirstOpen] = useState(true)
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  // Simulate security anomaly detection - only after onboarding
  useEffect(() => {
    if (!onboardingComplete) return
    const timer = setTimeout(() => {
      setAlertType("anomaly")
      setShowAlert(true)
    }, 8000)
    return () => clearTimeout(timer)
  }, [onboardingComplete])

  if (isFirstOpen && !onboardingComplete) {
    return (
      <OnboardingFlow
        onComplete={() => {
          setOnboardingComplete(true)
          setIsFirstOpen(false)
        }}
      />
    )
  }

  return (
    <div className="h-full flex flex-col bg-background relative overflow-hidden">
      {/* Ambient background - subtle, always present */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-primary/3 to-transparent" />
      </div>

      {/* Alert Overlay - surfaces for anomalies or high-value intents */}
      {showAlert && <AlertOverlay type={alertType} onDismiss={() => setShowAlert(false)} />}

      {/* Main Content */}
      <div className="flex-1 relative z-10 overflow-y-auto">
        {activeView === "ambient" && <AmbientHome />}
        {activeView === "portfolio" && <PortfolioHoldings />}
        {activeView === "transfer" && <TransferScreen />}
        {activeView === "card" && <VisaCard />}
        {activeView === "identity" && <IdentityPanel />}
      </div>

      {/* Persistent Command Bar - the primary interaction */}
      <CommandBar
        onHighValueIntent={() => {
          setAlertType("high-value")
          setShowAlert(true)
        }}
      />

      {/* Minimal Navigation */}
      <NavBar activeView={activeView} onViewChange={setActiveView} />
    </div>
  )
}
