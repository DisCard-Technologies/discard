"use client";

import Image from "next/image";
import { phone } from "@/public";
import React, { useEffect, useState } from "react";

export default function Phone({ className }: { className: string }) {
	const [rotate, setRotate] = useState(0);
	useEffect(() => {
		window.addEventListener("mousemove", (e) => {
			let mouseX = e.clientX;
			let mouseY = e.clientY;

			let deltaX = mouseX - window.innerWidth / 2;
			let deltaY = mouseY - window.innerHeight / 2;

			var angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
			setRotate(angle - 280);
		});
	}, []);

	return (
		<div className="w-full gap-[30px] flex items-center justify-center">
			<div
				className={`rounded-full flex items-center justify-center ${className}`}>
				<Image
					style={{
						transform: `rotate(${rotate}deg)`,
					}}
					src={phone}
					alt="img"
					className="w-full h-full object-contain"
				/>
			</div>
		</div>
	);
}
