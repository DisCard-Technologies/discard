"use client";

import {
	Herotextpay,
	Abouttextpay,
	Chelengetextpay,
	Resulttextpay,
	Workstextpay,
	Credittextpay,
	Videotextpay,
} from "@/container";
import { useEffect } from "react";
import { Curve, Ready } from "@/components";

export default function Work() {
	useEffect(() => {
		(async () => {
			const LocomotiveScroll = (await import("locomotive-scroll")).default;
			const locomotiveScroll = new LocomotiveScroll();
		})();
	}, []);
	return (
		<>
			<Curve backgroundColor="#f1f1f1">
				<Herotextpay />
				<Abouttextpay />
				<Chelengetextpay />
				<Videotextpay />
				<Resulttextpay />
				<Credittextpay />
				<Workstextpay />
				<Ready />
			</Curve>
		</>
	);
}
