"use client";
import { useEffect } from "react";
import { Curve, Marquee } from "@/components";
import Link from "next/link";

export default function Discard() {
	useEffect(() => {
		(async () => {
			const LocomotiveScroll = (await import("locomotive-scroll")).default;
			const locomotiveScroll = new LocomotiveScroll();
		})();
	}, []);

	return (
		<>
			<Curve backgroundColor={"#f1f1f1"}>
				{/* Hero Section */}
				<section className="min-h-screen bg-background flex items-center justify-center px-6 md:px-12">
					<div className="text-center max-w-6xl">
						<h1 className="font-FoundersGrotesk text-secondry text-[12vw] md:text-[10vw] lg:text-[8vw] leading-[0.9] tracking-[-0.03em] mb-8">
							PRIVACY.
							<br />
							INSTANTLY.
						</h1>
						<p className="font-NeueMontreal text-secondry text-lg md:text-xl lg:text-2xl max-w-2xl mx-auto mb-12 leading-relaxed">
							Spend your crypto anywhere with complete privacy. Discard creates virtual cards that protect your identity and secure your transactions.
						</p>
						<Link 
							href="#download" 
							className="font-NeueMontreal text-secondry text-lg underline hover:text-about hover:no-underline transition-all duration-300 ease-in-out group"
						>
							Download the App
							<span className="inline-block ml-2 group-hover:translate-x-1 transition-transform duration-300">→</span>
						</Link>
					</div>
				</section>

				{/* Marquee Banner */}
				<section className="w-full">
					<Marquee 
						title="SPEND CRYPTO ANYWHERE • SECURE YOUR PAYMENTS • ABSOLUTE PRIVACY •" 
						className="text-4xl md:text-6xl lg:text-7xl py-6"
					/>
				</section>

				{/* Features Section */}
				<section className="min-h-screen bg-background px-6 md:px-12 py-20">
					<div className="max-w-7xl mx-auto">
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
							{/* Sticky Headline */}
							<div className="lg:sticky lg:top-20 lg:h-fit">
								<h2 className="font-FoundersGrotesk text-secondry text-5xl md:text-6xl lg:text-7xl leading-[0.9] tracking-[-0.02em]">
									The Future of
									<br />
									Payments.
								</h2>
							</div>

							{/* Features List */}
							<div className="space-y-16">
								<div className="border-b border-[#21212133] pb-16">
									<div className="w-12 h-12 mb-6 flex items-center justify-center">
										<svg className="w-8 h-8 text-secondry" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
										</svg>
									</div>
									<h3 className="font-FoundersGrotesk text-secondry text-2xl md:text-3xl mb-4 tracking-[-0.01em]">
										Complete Privacy
									</h3>
									<p className="font-NeueMontreal text-secondry text-lg leading-relaxed mb-6">
										Your transactions are completely anonymous. No personal information is ever shared with merchants or third parties.
									</p>
									<Link 
										href="#privacy" 
										className="font-NeueMontreal text-secondry underline hover:text-about hover:no-underline transition-all duration-300 ease-in-out"
									>
										Learn more →
									</Link>
								</div>

								<div className="border-b border-[#21212133] pb-16">
									<div className="w-12 h-12 mb-6 flex items-center justify-center">
										<svg className="w-8 h-8 text-secondry" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
										</svg>
									</div>
									<h3 className="font-FoundersGrotesk text-secondry text-2xl md:text-3xl mb-4 tracking-[-0.01em]">
										Instant Conversion
									</h3>
									<p className="font-NeueMontreal text-secondry text-lg leading-relaxed mb-6">
										Convert crypto to fiat instantly at the point of sale. No waiting, no delays, just seamless transactions.
									</p>
									<Link 
										href="#conversion" 
										className="font-NeueMontreal text-secondry underline hover:text-about hover:no-underline transition-all duration-300 ease-in-out"
									>
										Learn more →
									</Link>
								</div>

								<div className="border-b border-[#21212133] pb-16">
									<div className="w-12 h-12 mb-6 flex items-center justify-center">
										<svg className="w-8 h-8 text-secondry" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
										</svg>
									</div>
									<h3 className="font-FoundersGrotesk text-secondry text-2xl md:text-3xl mb-4 tracking-[-0.01em]">
										Global Acceptance
									</h3>
									<p className="font-NeueMontreal text-secondry text-lg leading-relaxed mb-6">
										Use your virtual cards anywhere Visa or Mastercard is accepted. Online, in-store, or anywhere in the world.
									</p>
									<Link 
										href="#global" 
										className="font-NeueMontreal text-secondry underline hover:text-about hover:no-underline transition-all duration-300 ease-in-out"
									>
										Learn more →
									</Link>
								</div>

								<div>
									<div className="w-12 h-12 mb-6 flex items-center justify-center">
										<svg className="w-8 h-8 text-secondry" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
										</svg>
									</div>
									<h3 className="font-FoundersGrotesk text-secondry text-2xl md:text-3xl mb-4 tracking-[-0.01em]">
										Bank-Level Security
									</h3>
									<p className="font-NeueMontreal text-secondry text-lg leading-relaxed mb-6">
										Advanced encryption and security protocols protect every transaction. Your funds are always safe and secure.
									</p>
									<Link 
										href="#security" 
										className="font-NeueMontreal text-secondry underline hover:text-about hover:no-underline transition-all duration-300 ease-in-out"
									>
										Learn more →
									</Link>
								</div>
							</div>
						</div>
					</div>
				</section>

				{/* About Section */}
				<section className="min-h-screen bg-about flex items-center justify-center px-6 md:px-12 py-20">
					<div className="text-center max-w-4xl">
						<h2 className="font-FoundersGrotesk text-secondry text-5xl md:text-6xl lg:text-7xl leading-[0.9] tracking-[-0.02em] mb-8">
							Ready to reclaim your
							<br />
							financial privacy?
						</h2>
						<p className="font-NeueMontreal text-secondry text-xl md:text-2xl leading-relaxed mb-12 max-w-2xl mx-auto">
							Join thousands of users who have already taken control of their financial freedom with Discard&apos;s privacy-first payment solution.
						</p>
						<button 
							id="download"
							className="bg-secondry text-about font-NeueMontreal text-lg px-12 py-4 rounded-full hover:bg-[#333] transition-all duration-300 ease-in-out transform hover:scale-105"
						>
							Download Now
						</button>
					</div>
				</section>

				{/* Footer Section */}
				<section className="bg-background px-6 md:px-12 py-16">
					<div className="max-w-7xl mx-auto">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-12">
							<div>
								<div className="flex items-center mb-6">
									<h3 className="font-FoundersGrotesk text-secondry text-2xl tracking-[-0.01em]">
										DISCARD
									</h3>
								</div>
								<p className="font-NeueMontreal text-[#21212199] text-sm">
									© 2025 Discard. All rights reserved.
								</p>
							</div>
							<div className="flex flex-col md:items-end space-y-4">
								<div className="flex flex-col md:items-end space-y-2">
									<Link 
										href="/privacy" 
										className="font-NeueMontreal text-secondry hover:text-about transition-colors duration-300"
									>
										Privacy Policy
									</Link>
									<Link 
										href="/terms" 
										className="font-NeueMontreal text-secondry hover:text-about transition-colors duration-300"
									>
										Terms of Service
									</Link>
									<div className="flex space-x-4 mt-4">
										<Link 
											href="#twitter" 
											className="font-NeueMontreal text-secondry hover:text-about transition-colors duration-300"
										>
											Twitter
										</Link>
										<Link 
											href="#discord" 
											className="font-NeueMontreal text-secondry hover:text-about transition-colors duration-300"
										>
											Discord
										</Link>
										<Link 
											href="#telegram" 
											className="font-NeueMontreal text-secondry hover:text-about transition-colors duration-300"
										>
											Telegram
										</Link>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>
			</Curve>
		</>
	);
}
