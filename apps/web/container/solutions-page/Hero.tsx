export default function Hero() {
	return (
		<section className="w-full min-h-screen">
			<div className="w-full flex flex-col justify-between">
				<div className="w-full flex flex-col">
					<div className="w-full margin padding-x">
						<div>
							<h1 className="heading tracking-[-1.3px] text-[#212121] font-semibold font-FoundersGrotesk uppercase">
								solutions
							</h1>
						</div>
					</div>
					<div className="w-full border-t border-[#21212155]">
						<p className="w-[80%] sm:w-full xm:w-full sub-heading font-normal padding-x font-NeueMontreal text-secondry padding-y">
							We create everything you&nbsp;
							<span className="xl:link-flash lg:link-flash md:link-flash cursor-pointer">
								need to&nbsp;
							</span>
							spend&nbsp;
							<span className="xl:link-flash lg:link-flash md:link-flash cursor-pointer">
								crypto&nbsp;
							</span>
							like cash.
						</p>
					</div>
					<div className="w-full flex border-t border-[#21212155] py-[20px] flex-col">
						<div className="w-full flex justify-between sm:flex-col xm:flex-col padding-x sm:gap-[20px] xm:gap-[20px]">
							<div className="w-[50%] sm:w-full xm:w-full">
								<p className="paragraph font-NeueMontreal text-secondry">
									How? Our complete <br /> payment ecosystem:
								</p>
							</div>
							<div className="w-[50%] sm:w-full xm:w-full flex justify-between sm:flex-col xm:flex-col gap-[20px]	">
								<div className="w-[50%] sm:w-full xm:w-full flex flex-col gap-[20px]">
									<div className="flex flex-col gap-[20px]">
										<p className="paragraph font-NeueMontreal text-secondry underline">
											True Digital Inclusion
										</p>
										<p className="paragraph font-NeueMontreal text-secondry">
											Spend crypto at 39 million merchants worldwide with Discards.
											<br className="sm:hidden xm:hidden" /> TextPay works on $10 feature phones via SMS/USSD. <br className="sm:hidden xm:hidden" />
											Serving everyone from
											<br className="sm:hidden xm:hidden" /> crypto natives to the 350M unbanked.
										</p>
									</div>
									<div className="flex flex-col gap-[20px]">
										<p className="paragraph font-NeueMontreal text-secondry underline">
											Revolutionary Privacy Protection
										</p>
										<p className="paragraph font-NeueMontreal text-secondry">
											Discards can disappear after use, offering unlinkable transactions.
											<br className="sm:hidden xm:hidden" /> SMS Payments with self-custodial
											keys, for no platform tracking.
											<br className="sm:hidden xm:hidden" /> Financial
											privacy for the
											digital age.
										</p>
									</div>
								</div>
								<div className="w-[50%] sm:w-full xm:w-full">
									<div className="flex flex-col gap-[20px]">
										<p className="paragraph font-NeueMontreal text-secondry underline">
											Instant Global Settlement
										</p>
										<p className="paragraph font-NeueMontreal text-secondry">
										    Real-time crypto-to-fiat conversion
											<br className="sm:hidden xm:hidden" />
											30-send settlement versus competitors.
											<br className="sm:hidden xm:hidden" /> No correspondent banking delays
											or geographic restrictions.
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
