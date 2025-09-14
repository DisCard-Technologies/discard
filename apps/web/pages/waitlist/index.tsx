"use client";
import { useEffect } from "react";
import { Curve } from "@/components";
import { HeroWaitlist, FormWaitlist, SocialsWaitlist, } from "@/container";

export default function Waitlist() {
	useEffect(() => {
		(async () => {
			const LocomotiveScroll = (await import("locomotive-scroll")).default;
			const locomotiveScroll = new LocomotiveScroll();
		})();
	}, []);
	return (
		<>
			<Curve backgroundColor={"#f1f1f1"}>
				<HeroWaitlist />
				<FormWaitlist />
				<SocialsWaitlist />
			</Curve>
		</>
	);
}
