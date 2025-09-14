"use client";

import Link from "next/link";
import { useState } from "react";
import { RoundButton, RoundSubmitButton } from "@/components";
import { motion } from "framer-motion";
import { WaitlistFormData } from "@/lib/validations";

export default function FormWaitlist() {
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		company: "",
		product: "both",
		useCase: "",
		timeline: "",
		agreeToUpdates: false
	});
	const [isSubmitted, setIsSubmitted] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch("/api/waitlist/join", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(formData),
			});

			const result = await response.json();

			if (response.ok) {
				setIsSubmitted(true);
			} else {
				setError(result.message || "An error occurred. Please try again.");
			}
		} catch (err) {
			setError("An error occurred. Please try again.");
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
		const { name, value, type } = e.target;
		setFormData(prev => ({
			...prev,
			[name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
		}));
	};

	if (isSubmitted) {
		return (
			<section className="w-full padding-x padding-y bg-about rounded-t-[20px] mt-[-20px]">
				<motion.div
					initial={{ scale: 0.8, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={{ duration: 0.5, ease: [0.215, 0.61, 0.355, 1] }}
					className="text-center py-[100px]"
				>
					<h1 className="sub-heading font-FoundersGrotesk text-secondry uppercase mb-[30px]">
						You&apos;re on the list! 🎉
					</h1>
					<p className="paragraph font-NeueMontreal text-secondry mb-[20px]">
						Thank you for joining the waitlist for {formData.product === 'both' ? 'DisCard and TextPay' : formData.product === 'discard' ? 'DisCard' : 'TextPay'}.
					</p>
					<p className="paragraph font-NeueMontreal text-secondry mb-[40px]">
						We&apos;ll notify you as soon as early access becomes available. Keep an eye on your inbox!
					</p>
					<div className="flex items-center justify-center">
						<div className="w-fit flex items-center justify-between bg-secondry cursor-pointer rounded-full group">
							<RoundButton
								bgcolor="#212121"
								href="/"
								title="back to home"
								className="bg-white text-black"
								style={{ color: "#fff" }}
							/>
						</div>
					</div>
				</motion.div>
			</section>
		);
	}

	return (
		<section className="w-full padding-x padding-y">
			<form onSubmit={handleSubmit} className="w-full flex flex-col gap-[15px]">
				{/* Name and Email Row */}
				<div className="w-full flex gap-[15px] sm:flex-col xm:flex-col">
					<div className="flex gap-[10px] w-[50%] sm:w-full xm:w-full sm:flex-col xm:flex-col">
						<div className="xl:min-w-max lg:min-w-max md:min-w-max">
							<h2 className="sub-heading font-NeueMontreal font-normal text-secondry">
								Hi! My name is
							</h2>
						</div>
						<div className="w-full">
							<input
								type="text"
								name="name"
								value={formData.name}
								onChange={handleInputChange}
								placeholder="Enter your name*"
								required
								className="paragraph w-full font-NeueMontreal font-normal text-secondry bg-background border-b border-[#21212155] focus:border-secondry text-center sm:text-left xm:text-left outline-none focus:placeholder:opacity-0 mt-[20px] transform transition duration-200 ease-in-out sm:w-full xm:w-full"
							/>
						</div>
					</div>
					<div className="flex gap-[10px] w-[50%] sm:w-full xm:w-full sm:flex-col xm:flex-col">
						<div className="xl:min-w-max lg:min-w-max md:min-w-max">
							<h2 className="sub-heading font-NeueMontreal font-normal text-secondry">
								and you can reach me at
							</h2>
						</div>
						<div className="w-full">
							<input
								type="email"
								name="email"
								value={formData.email}
								onChange={handleInputChange}
								placeholder="name@example.com*"
								required
								className="paragraph w-full font-NeueMontreal font-normal text-secondry bg-background border-b border-[#21212155] focus:border-secondry text-center sm:text-left xm:text-left outline-none focus:placeholder:opacity-0 mt-[20px] transform transition duration-200 ease-in-out sm:w-full xm:w-full"
							/>
						</div>
					</div>
				</div>

				{/* Company and Product Interest Row */}
				<div className="w-full flex gap-[15px] sm:flex-col xm:flex-col">
					<div className="flex gap-[10px] w-[50%] sm:w-full xm:w-full sm:flex-col xm:flex-col">
						<div className="xl:min-w-max lg:min-w-max md:min-w-max">
							<h2 className="sub-heading font-NeueMontreal font-normal text-secondry">
								I work with
							</h2>
						</div>
						<div className="w-full">
							<input
								type="text"
								name="company"
								value={formData.company}
								onChange={handleInputChange}
								placeholder="Company name (optional)"
								className="paragraph w-full font-NeueMontreal font-normal text-secondry bg-background border-b border-[#21212155] focus:border-secondry text-center sm:text-left xm:text-left outline-none focus:placeholder:opacity-0 mt-[20px] transform transition duration-200 ease-in-out sm:w-full xm:w-full"
							/>
						</div>
					</div>
					<div className="flex gap-[10px] w-[50%] sm:w-full xm:w-full sm:flex-col xm:flex-col">
						<div className="xl:min-w-max lg:min-w-max md:min-w-max">
							<h2 className="sub-heading font-NeueMontreal font-normal text-secondry">
								and I&apos;m interested in
							</h2>
						</div>
						<div className="w-full">
							<select
								name="product"
								value={formData.product}
								onChange={handleInputChange}
								className="paragraph w-full font-NeueMontreal font-normal text-secondry bg-background border-b border-[#21212155] focus:border-secondry text-center sm:text-left xm:text-left outline-none mt-[20px] transform transition duration-200 ease-in-out sm:w-full xm:w-full"
							>
								<option value="both">Both DisCard & TextPay</option>
								<option value="discard">DisCard (Virtual Cards)</option>
								<option value="textpay">TextPay (Mobile Payments)</option>
							</select>
						</div>
					</div>
				</div>

				{/* Use Case Row */}
				<div className="w-full flex gap-[10px]">
					<div className="flex gap-[10px] w-full sm:flex-col xm:flex-col">
						<div className="xl:min-w-max lg:min-w-max md:min-w-max">
							<h2 className="sub-heading font-NeueMontreal font-normal text-secondry">
								I&apos;m planning to use this for
							</h2>
						</div>
						<div className="w-full">
							<input
								type="text"
								name="useCase"
								value={formData.useCase}
								onChange={handleInputChange}
								placeholder="Personal use, business payments, e-commerce..."
								className="paragraph font-NeueMontreal font-normal text-secondry bg-background border-b border-[#21212155] focus:border-secondry text-center sm:text-left xm:text-left outline-none focus:placeholder:opacity-0 mt-[20px] transform transition duration-200 ease-in-out w-full sm:w-full xm:w-full"
							/>
						</div>
					</div>
				</div>

				{/* Submit Section */}
				<div className="w-full flex items-center justify-end sm:justify-start xm:justify-start pt-[50px]">
					<div className="flex sm:flex-col xm:flex-col gap-[25px]">
						{error && <p className="w-full text-red-500 text-sm font-NeueMontreal text-right sm:text-left xm:text-left">{error}</p>}
						<div className="flex gap-[10px] items-center">
							<div className="flex gap-[10px]">
								<input
									type="checkbox"
									name="agreeToUpdates"
									checked={formData.agreeToUpdates}
									onChange={handleInputChange}
									className="w-[20px] h-[20px]"
									required
								/>
								<p className="paragraph text-secondry font-NeueMontreal font-normal">
									I agree to receive product launch updates and 
								</p>
							</div>
							<Link
								className="paragraph font-medium font-NeueMontreal text-secondry capitalize flex flex-col hover"
								href={"/privacy"}>
								Privacy Policy
							</Link>
						</div>
						<div className="w-fit flex items-center justify-between bg-secondry cursor-pointer rounded-full group">
							<RoundSubmitButton
								bgcolor="#212121"
								title={isLoading ? "joining..." : "join waitlist"}
								className="bg-white text-black"
								style={{ color: "#fff" }}
								disabled={isLoading}
								isLoading={isLoading}
							/>
						</div>
					</div>
				</div>
			</form>
		</section>
	);
}