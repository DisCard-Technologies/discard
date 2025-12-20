"use client"

import { useState } from "react"
import {
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Search,
  Sparkles,
  ChevronRight,
  QrCode,
  Copy,
  Check,
  Clock,
  Zap,
  ArrowRight,
  Users,
  Repeat,
} from "lucide-react"

type TransferMode = "send" | "receive" | "request"

interface Contact {
  id: string
  name: string
  handle: string
  avatar: string
  recent?: boolean
  verified?: boolean
}

interface RecentTransfer {
  id: string
  type: "sent" | "received" | "requested"
  contact: Contact
  amount: number
  token: string
  timestamp: string
  status: "completed" | "pending" | "expired"
}

const contacts: Contact[] = [
  { id: "1", name: "Alex Chen", handle: "alex.eth", avatar: "AC", recent: true, verified: true },
  { id: "2", name: "Sarah Miller", handle: "0x7a3...f29", avatar: "SM", recent: true },
  { id: "3", name: "MetaMask Vault", handle: "vault.metamask.eth", avatar: "MM", verified: true },
  { id: "4", name: "Jordan Lee", handle: "jordan.base", avatar: "JL", recent: true, verified: true },
  { id: "5", name: "Dev Wallet", handle: "0x9b2...c18", avatar: "DW" },
  { id: "6", name: "Emma Wilson", handle: "emma.ens", avatar: "EW", verified: true },
]

const recentTransfers: RecentTransfer[] = [
  {
    id: "1",
    type: "sent",
    contact: contacts[0],
    amount: 150,
    token: "USDC",
    timestamp: "2 hours ago",
    status: "completed",
  },
  {
    id: "2",
    type: "received",
    contact: contacts[3],
    amount: 0.25,
    token: "ETH",
    timestamp: "Yesterday",
    status: "completed",
  },
  {
    id: "3",
    type: "requested",
    contact: contacts[1],
    amount: 75,
    token: "USDC",
    timestamp: "2 days ago",
    status: "pending",
  },
]

export function TransferScreen() {
  const [mode, setMode] = useState<TransferMode>("send")
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [amount, setAmount] = useState("")
  const [selectedToken, setSelectedToken] = useState("USDC")
  const [searchQuery, setSearchQuery] = useState("")
  const [showQR, setShowQR] = useState(false)
  const [copied, setCopied] = useState(false)
  const [memo, setMemo] = useState("")

  const walletAddress = "0x7F3a...8b2E"
  const fullAddress = "0x7F3a92Bc4D1e8A6f5C0B9E7D2F4A8b2E"

  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.handle.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleCopy = () => {
    navigator.clipboard.writeText(fullAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSend = () => {
    // Would trigger high-value alert for large amounts
    console.log("Sending", amount, selectedToken, "to", selectedContact?.handle)
  }

  const tokens = [
    { symbol: "USDC", balance: 2847.5 },
    { symbol: "ETH", balance: 1.834 },
    { symbol: "SOL", balance: 24.5 },
    { symbol: "USDT", balance: 500 },
  ]

  return (
    <div className="p-4 space-y-4">
      {/* Header with mode selector */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Move Money</h1>
          <button className="flex items-center gap-1.5 text-xs text-primary">
            <Clock className="w-3.5 h-3.5" />
            History
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-2 p-1 rounded-xl bg-secondary/30">
          {[
            { id: "send" as const, icon: ArrowUpRight, label: "Send" },
            { id: "receive" as const, icon: ArrowDownLeft, label: "Receive" },
            { id: "request" as const, icon: FileText, label: "Request" },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setMode(tab.id)
                  setSelectedContact(null)
                  setAmount("")
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  mode === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* SEND MODE */}
      {mode === "send" && (
        <div className="space-y-4">
          {!selectedContact ? (
            <>
              {/* Search / Select Recipient */}
              <div className="glass-card rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search name, ENS, or address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>

                {/* Recent Contacts */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Recent</p>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {contacts
                      .filter((c) => c.recent)
                      .map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => setSelectedContact(contact)}
                          className="flex flex-col items-center gap-2 min-w-[64px]"
                        >
                          <div className="relative">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-sm font-medium text-foreground">
                              {contact.avatar}
                            </div>
                            {contact.verified && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground truncate max-w-[64px]">
                            {contact.name.split(" ")[0]}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>

                {/* All Contacts */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">All Contacts</p>
                  <div className="space-y-1">
                    {filteredContacts.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => setSelectedContact(contact)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/30 transition-colors"
                      >
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-sm font-medium text-foreground">
                            {contact.avatar}
                          </div>
                          {contact.verified && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="w-2 h-2 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">{contact.handle}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Transfers */}
              <div className="glass-card rounded-2xl p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Recent Activity</p>
                {recentTransfers.slice(0, 3).map((transfer) => (
                  <div
                    key={transfer.id}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/20 transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        transfer.type === "sent"
                          ? "bg-orange-500/10 text-orange-400"
                          : transfer.type === "received"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-primary/10 text-primary"
                      }`}
                    >
                      {transfer.type === "sent" ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : transfer.type === "received" ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">
                        {transfer.type === "sent"
                          ? "Sent to"
                          : transfer.type === "received"
                            ? "From"
                            : "Requested from"}{" "}
                        {transfer.contact.name.split(" ")[0]}
                      </p>
                      <p className="text-xs text-muted-foreground">{transfer.timestamp}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-medium ${
                          transfer.type === "received" ? "text-emerald-400" : "text-foreground"
                        }`}
                      >
                        {transfer.type === "received" ? "+" : transfer.type === "sent" ? "-" : ""}
                        {transfer.amount} {transfer.token}
                      </p>
                      {transfer.status === "pending" && <span className="text-[10px] text-amber-400">Pending</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Amount Entry */}
              <div className="glass-card rounded-2xl p-6 space-y-6">
                {/* Recipient */}
                <button onClick={() => setSelectedContact(null)} className="flex items-center gap-3 w-full">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center font-medium text-foreground">
                      {selectedContact.avatar}
                    </div>
                    {selectedContact.verified && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm text-muted-foreground">Sending to</p>
                    <p className="text-foreground font-medium">{selectedContact.name}</p>
                  </div>
                  <span className="text-xs text-primary">Change</span>
                </button>

                {/* Amount Input */}
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-4xl font-light text-muted-foreground">$</span>
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0"
                      className="text-5xl font-light text-foreground bg-transparent focus:outline-none w-48 text-center"
                    />
                  </div>

                  {/* Quick amounts */}
                  <div className="flex justify-center gap-2">
                    {["25", "50", "100", "500"].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setAmount(amt)}
                        className="px-4 py-1.5 rounded-full bg-secondary/30 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Token Selector */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">Pay with</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    {tokens.map((token) => (
                      <button
                        key={token.symbol}
                        onClick={() => setSelectedToken(token.symbol)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                          selectedToken === token.symbol
                            ? "bg-primary/10 border border-primary/30 text-foreground"
                            : "bg-secondary/30 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="text-sm font-medium">{token.symbol}</span>
                        <span className="text-xs text-muted-foreground">
                          {token.symbol === "USDC" || token.symbol === "USDT"
                            ? `$${token.balance.toLocaleString()}`
                            : token.balance.toFixed(3)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Memo */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Add a note (optional)"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </div>

              {/* Transfer Details */}
              <div className="glass-card rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Network fee</span>
                  <span className="text-foreground flex items-center gap-1">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    ~$0.02
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Arrives in</span>
                  <span className="text-foreground">Instant</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Route</span>
                  <span className="text-foreground flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary" />
                    AI Optimized
                  </span>
                </div>
              </div>

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={!amount || Number.parseFloat(amount) <= 0}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center justify-center gap-2 glow-primary"
              >
                <ArrowUpRight className="w-5 h-5" />
                Send {amount ? `$${amount}` : ""} {selectedToken}
              </button>
            </>
          )}
        </div>
      )}

      {/* RECEIVE MODE */}
      {mode === "receive" && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-6 space-y-6">
            {/* QR Code */}
            <div className="flex flex-col items-center gap-4">
              <div
                className={`relative w-48 h-48 rounded-2xl bg-white p-3 transition-all ${showQR ? "scale-100" : "scale-95"}`}
              >
                <div className="w-full h-full rounded-xl bg-gradient-to-br from-foreground/90 to-foreground flex items-center justify-center">
                  <QrCode className="w-32 h-32 text-white" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                    <span className="text-primary-foreground font-bold text-lg">N</span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">Scan to send funds to this wallet</p>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">Your Address</p>
              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-3 p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors group"
              >
                <code className="text-sm text-foreground font-mono">{walletAddress}</code>
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
              </button>
            </div>

            {/* Network Pills */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">
                Supported Networks
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"].map((network) => (
                  <span
                    key={network}
                    className="px-3 py-1.5 rounded-full bg-secondary/30 text-xs text-muted-foreground"
                  >
                    {network}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Share Options */}
          <div className="glass-card rounded-2xl p-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Users, label: "Share" },
                { icon: FileText, label: "Invoice" },
                { icon: Repeat, label: "Recurring" },
              ].map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    className="flex flex-col items-center gap-2 py-4 rounded-xl bg-secondary/20 hover:bg-secondary/40 transition-colors"
                  >
                    <Icon className="w-5 h-5 text-primary" />
                    <span className="text-xs text-muted-foreground">{action.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* REQUEST MODE */}
      {mode === "request" && (
        <div className="space-y-4">
          {!selectedContact ? (
            <>
              {/* Request from who */}
              <div className="glass-card rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Request from..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>

                {/* Contacts */}
                <div className="space-y-1">
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContact(contact)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/30 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-sm font-medium text-foreground">
                        {contact.avatar}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-foreground">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.handle}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Pending Requests */}
              <div className="glass-card rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Pending Requests</p>
                  <span className="text-xs text-primary">View all</span>
                </div>
                {recentTransfers
                  .filter((t) => t.type === "requested" && t.status === "pending")
                  .map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10"
                    >
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">From {request.contact.name}</p>
                        <p className="text-xs text-muted-foreground">{request.timestamp}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          ${request.amount} {request.token}
                        </p>
                        <button className="text-[10px] text-primary">Remind</button>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <>
              {/* Request Amount */}
              <div className="glass-card rounded-2xl p-6 space-y-6">
                <button onClick={() => setSelectedContact(null)} className="flex items-center gap-3 w-full">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center font-medium text-foreground">
                    {selectedContact.avatar}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm text-muted-foreground">Requesting from</p>
                    <p className="text-foreground font-medium">{selectedContact.name}</p>
                  </div>
                  <span className="text-xs text-primary">Change</span>
                </button>

                {/* Amount Input */}
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-4xl font-light text-muted-foreground">$</span>
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0"
                      className="text-5xl font-light text-foreground bg-transparent focus:outline-none w-48 text-center"
                    />
                  </div>

                  <div className="flex justify-center gap-2">
                    {["25", "50", "100", "500"].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setAmount(amt)}
                        className="px-4 py-1.5 rounded-full bg-secondary/30 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="What's this for?"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </div>

              {/* Request Button */}
              <button
                disabled={!amount || Number.parseFloat(amount) <= 0}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center justify-center gap-2 glow-primary"
              >
                <ArrowRight className="w-5 h-5" />
                Request ${amount || "0"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
