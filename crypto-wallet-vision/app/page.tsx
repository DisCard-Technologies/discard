import { WalletApp } from "@/components/wallet-app"

export default function Home() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[430px] h-[932px] bg-background rounded-[3rem] overflow-hidden border border-border relative shadow-2xl">
        {/* Phone notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-8 bg-background rounded-b-3xl z-50" />
        <WalletApp />
      </div>
    </main>
  )
}
