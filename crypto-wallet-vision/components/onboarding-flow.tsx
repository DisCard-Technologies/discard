"use client"

import { useState, useEffect } from "react"
import { Fingerprint, Scan, Shield, Sparkles, Check, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

type OnboardingStep = "splash" | "biometric" | "generating" | "complete"

interface OnboardingFlowProps {
  onComplete: () => void
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>("splash")
  const [progress, setProgress] = useState(0)
  const [deviceType, setDeviceType] = useState<"face" | "fingerprint">("face")

  // Simulate device detection
  useEffect(() => {
    // Mock: randomly assign device type for demo
    setDeviceType(Math.random() > 0.5 ? "face" : "fingerprint")
  }, [])

  // Simulate key generation progress
  useEffect(() => {
    if (step === "generating") {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            setTimeout(() => setStep("complete"), 500)
            return 100
          }
          return prev + 2
        })
      }, 50)
      return () => clearInterval(interval)
    }
  }, [step])

  const handleBiometricTrigger = () => {
    setStep("biometric")
    // Simulate biometric verification
    setTimeout(() => {
      setStep("generating")
    }, 2000)
  }

  return (
    <div className="h-full flex flex-col bg-background relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px]" />
      </div>

      {/* Content */}
      <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-8">
        {step === "splash" && <SplashScreen onContinue={handleBiometricTrigger} deviceType={deviceType} />}
        {step === "biometric" && <BiometricScreen deviceType={deviceType} />}
        {step === "generating" && <GeneratingScreen progress={progress} />}
        {step === "complete" && <CompleteScreen onContinue={onComplete} />}
      </div>

      {/* Bottom indicator */}
      <div className="relative z-10 pb-12 flex justify-center gap-2">
        {["splash", "biometric", "generating", "complete"].map((s, i) => (
          <div
            key={s}
            className={`h-1 rounded-full transition-all duration-500 ${
              ["splash", "biometric", "generating", "complete"].indexOf(step) >= i ? "w-8 bg-primary" : "w-2 bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function SplashScreen({ onContinue, deviceType }: { onContinue: () => void; deviceType: "face" | "fingerprint" }) {
  return (
    <div className="flex flex-col items-center text-center max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Logo */}
      <div className="mb-8 relative">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 glass-card flex items-center justify-center glow-primary">
          <Shield className="w-10 h-10 text-primary" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-primary-foreground" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-3">Welcome to DisCard</h1>

      {/* Main message - replacing "12 words" */}
      <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
        Secure your DisCard with your <span className="text-primary font-medium">device identity</span>.
      </p>

      {/* Info cards */}
      <div className="w-full space-y-3 mb-10">
        <div className="glass-card rounded-xl p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {deviceType === "face" ? (
              <Scan className="w-5 h-5 text-primary" />
            ) : (
              <Fingerprint className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Hardware-Bound Security</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your private key is generated inside the Secure Enclave and never leaves your device.
            </p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-accent" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">No Seed Phrases</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Passkey technology eliminates the need to write down or store recovery words.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <Button
        onClick={onContinue}
        className="w-full h-14 text-base font-medium rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 glow-primary"
      >
        <span>Continue with {deviceType === "face" ? "Face ID" : "Fingerprint"}</span>
        <ChevronRight className="w-5 h-5 ml-2" />
      </Button>

      <p className="text-xs text-muted-foreground mt-4">Uses WebAuthn / Passkey standard</p>
    </div>
  )
}

function BiometricScreen({ deviceType }: { deviceType: "face" | "fingerprint" }) {
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setScanning(true), 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-col items-center text-center animate-in fade-in duration-500">
      {/* Biometric visual */}
      <div className="relative mb-10">
        {/* Outer rings */}
        <div
          className={`absolute inset-0 w-48 h-48 rounded-full border border-primary/20 transition-all duration-1000 ${
            scanning ? "scale-150 opacity-0" : "scale-100 opacity-100"
          }`}
        />
        <div
          className={`absolute inset-0 w-48 h-48 rounded-full border border-primary/30 transition-all duration-1000 delay-200 ${
            scanning ? "scale-125 opacity-0" : "scale-100 opacity-100"
          }`}
        />

        {/* Main icon container */}
        <div
          className={`w-48 h-48 rounded-full glass-card flex items-center justify-center transition-all duration-500 ${
            scanning ? "glow-primary" : ""
          }`}
        >
          {deviceType === "face" ? (
            <div className="relative">
              <Scan
                className={`w-20 h-20 transition-colors duration-500 ${scanning ? "text-primary" : "text-muted-foreground"}`}
              />
              {scanning && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="w-16 h-0.5 bg-primary animate-pulse"
                    style={{ animation: "scan 1.5s ease-in-out infinite" }}
                  />
                </div>
              )}
            </div>
          ) : (
            <Fingerprint
              className={`w-20 h-20 transition-colors duration-500 ${scanning ? "text-primary" : "text-muted-foreground"}`}
            />
          )}
        </div>

        {/* Scanning indicator */}
        {scanning && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30">
            <p className="text-xs text-primary font-medium">Verifying...</p>
          </div>
        )}
      </div>

      <h2 className="text-xl font-medium text-foreground mb-2">
        {deviceType === "face" ? "Look at your device" : "Touch the sensor"}
      </h2>
      <p className="text-sm text-muted-foreground">Authenticate to generate your secure wallet</p>
    </div>
  )
}

function GeneratingScreen({ progress }: { progress: number }) {
  return (
    <div className="flex flex-col items-center text-center animate-in fade-in duration-500">
      {/* Key generation visual */}
      <div className="relative mb-10">
        <div className="w-48 h-48 rounded-full glass-card flex items-center justify-center relative overflow-hidden">
          {/* Progress ring */}
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="96" cy="96" r="88" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" />
            <circle
              cx="96"
              cy="96"
              r="88"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-primary"
              strokeDasharray={553}
              strokeDashoffset={553 - (553 * progress) / 100}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.1s ease-out" }}
            />
          </svg>

          {/* Center content */}
          <div className="flex flex-col items-center">
            <Shield className="w-12 h-12 text-primary mb-2" />
            <span className="text-2xl font-mono font-semibold text-foreground">{progress}%</span>
          </div>
        </div>
      </div>

      <h2 className="text-xl font-medium text-foreground mb-2">Generating Secure Keys</h2>

      {/* Status updates */}
      <div className="space-y-2 text-sm text-muted-foreground">
        <p className={progress >= 20 ? "text-foreground" : ""}>
          {progress >= 20 ? "✓" : "○"} Initializing Secure Enclave
        </p>
        <p className={progress >= 50 ? "text-foreground" : ""}>{progress >= 50 ? "✓" : "○"} Generating key pair</p>
        <p className={progress >= 80 ? "text-foreground" : ""}>{progress >= 80 ? "✓" : "○"} Registering with network</p>
        <p className={progress >= 100 ? "text-foreground" : ""}>{progress >= 100 ? "✓" : "○"} Finalizing wallet</p>
      </div>

      <p className="text-xs text-muted-foreground mt-6 max-w-xs">
        Your private key is being created inside your device's hardware security module. It will never leave this
        device.
      </p>
    </div>
  )
}

function CompleteScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col items-center text-center max-w-sm animate-in fade-in zoom-in-95 duration-500">
      {/* Success visual */}
      <div className="mb-8 relative">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center glow-primary">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
            <Check className="w-8 h-8 text-primary-foreground" strokeWidth={3} />
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-semibold text-foreground mb-3">You're All Set</h2>

      <p className="text-muted-foreground mb-8">
        Your sovereign identity is now secured by your device's hardware. No seed phrases, no cloud backups—just you and
        your device.
      </p>

      {/* Wallet preview card */}
      <div className="w-full glass-card rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Your Wallet</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-green-500">Secured</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground font-mono">0x7f3a...8c2d</p>
            <p className="text-xs text-muted-foreground">Passkey Protected</p>
          </div>
        </div>
      </div>

      <Button
        onClick={onContinue}
        className="w-full h-14 text-base font-medium rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Enter DisCard
      </Button>
    </div>
  )
}
