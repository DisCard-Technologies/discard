"use client";

import {
	Herodiscard,
	Aboutdiscard,
	Chelengediscard,
	Resultdiscard,
	Worksdiscard,
	Creditdiscard,
	Videodiscard,
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
				<Herodiscard />
				<Aboutdiscard />
				<Chelengediscard />
				<Videodiscard />
				<Resultdiscard />
				<Creditdiscard />
				<Worksdiscard />
				<Ready />
			</Curve>
		</>
	);
}
