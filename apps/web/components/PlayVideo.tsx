"use client";

import Image from "next/image";
import { eyes, maze } from "@/public";
import { useEffect, useRef, useState, Suspense, lazy } from "react";
import { useScroll, useTransform, motion } from "framer-motion";

// Poster image fallback component
const VideoPosterFallback = () => {
	const [rotate, setRotate] = useState(0);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			let mouseX = e.clientX;
			let mouseY = e.clientY;
			let deltaX = mouseX - window.innerWidth / 2;
			let deltaY = mouseY - window.innerHeight / 2;
			var angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
			setRotate(angle - 180);
		};

		window.addEventListener("mousemove", handleMouseMove);
		return () => window.removeEventListener("mousemove", handleMouseMove);
	}, []);

	const container = useRef(null);
	const { scrollYProgress } = useScroll({
		target: container,
		offset: ["start end", "end start"],
	});
	const mq = useTransform(scrollYProgress, [0, 1], [0, -400]);

	return (
		<div className="w-full relative overflow-hidden cursor-pointer">
			<div
				className="w-full h-full"
				data-scroll
				data-scroll-speed="-.8"
				data-scroll-section>
				{/* Poster image with proper aspect ratio*/}
				<div className="w-full h-full relative">
					<Image
						src={maze}
						alt="maze-img"
						fill
						className="w-full h-full object-cover"
						priority
						sizes="100vw"
					/>
					{/* Dark overlay for better contrast */}
					<div className="absolute inset-0 bg-black bg-opacity-25" />
				</div>

				{/* Play buttons overlay */}
				<div className="w-full absolute top-[50%] transform translate-y-[-50%] gap-[30px] flex items-center justify-center">
					<div className="w-[200px] h-[200px] sm:w-[150px] sm:h-[150px] xm:w-[100px] xm:h-[100px] bg-white rounded-full flex items-center justify-center opacity-90 animate-pulse">
						<div className="relative w-full h-full">
							<Image
								style={{
									transform: `rotate(${rotate}deg)`,
								}}
								src={eyes}
								alt="img"
								className="w-full h-full object-cover"
							/>
							<p className="absolute top-1/2 left-1/2 paragraph uppercase text-white font-NeueMontreal font-medium transform translate-x-[-50%] translate-y-[-50%]">
								Loading...
							</p>
						</div>
					</div>
					<div className="w-[200px] sm:w-[150px] sm:h-[150px] xm:w-[100px] xm:h-[100px] bg-white rounded-full flex items-center justify-center opacity-90 animate-pulse">
						<div className="relative w-full h-full">
							<Image
								style={{
									transform: `rotate(${rotate}deg)`,
								}}
								src={eyes}
								alt="img"
								className="w-full h-full object-cover"
							/>
							<p className="absolute top-1/2 left-1/2 paragraph uppercase text-white font-NeueMontreal font-medium transform translate-x-[-50%] translate-y-[-50%]">
								Loading...
							</p>
						</div>
					</div>
				</div>

				{/* Loading spinner */}
				<div className="absolute top-4 right-4">
					<div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin opacity-75"></div>
				</div>
			</div>
		</div>
	);
};

// Main video player component
const VideoPlayer = ({ videosrc }: { videosrc: string }) => {
	const [rotate, setRotate] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [canPlay, setCanPlay] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);

	const togglePlay = () => {
		if (videoRef.current && canPlay) {
			if (isPlaying) {
				videoRef.current.pause();
			} else {
				videoRef.current.play();
			}
			setIsPlaying(!isPlaying);
		}
	};

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		const handleLoadStart = () => setIsLoading(true);
		const handleCanPlay = () => {
			setCanPlay(true);
			setIsLoading(false);
		};
		const handleLoadedData = () => setIsLoading(false);
		const handleWaiting = () => setIsLoading(true);
		const handlePlaying = () => setIsLoading(false);

		video.addEventListener('loadstart', handleLoadStart);
		video.addEventListener('canplay', handleCanPlay);
		video.addEventListener('loadeddata', handleLoadedData);
		video.addEventListener('waiting', handleWaiting);
		video.addEventListener('playing', handlePlaying);

		return () => {
			video.removeEventListener('loadstart', handleLoadStart);
			video.removeEventListener('canplay', handleCanPlay);
			video.removeEventListener('loadeddata', handleLoadedData);
			video.removeEventListener('waiting', handleWaiting);
			video.removeEventListener('playing', handlePlaying);
		};
	}, []);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			let mouseX = e.clientX;
			let mouseY = e.clientY;
			let deltaX = mouseX - window.innerWidth / 2;
			let deltaY = mouseY - window.innerHeight / 2;
			var angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
			setRotate(angle - 180);
		};

		window.addEventListener("mousemove", handleMouseMove);
		return () => window.removeEventListener("mousemove", handleMouseMove);
	}, []);

	const container = useRef(null);

	const { scrollYProgress } = useScroll({
		target: container,
		offset: ["start end", "end start"],
	});

	const mq = useTransform(scrollYProgress, [0, 1], [0, -400]);

	return (
		<div
			className="w-full relative overflow-hidden cursor-pointer"
			ref={container}
			onClick={togglePlay}>
			<div
				className="w-full h-full"
				data-scroll
				data-scroll-speed="-.8"
				data-scroll-section>
				<video
					className="w-full h-full"
					loop
					muted
					playsInline
					preload="metadata"
					poster={maze.src}
					ref={videoRef}
					src={videosrc}
				/>

				{/* Loading indicator */}
				{isLoading && (
					<div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
						<div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
					</div>
				)}

				<motion.div
					className={`w-full absolute top-[50%] transform translate-y-[-50%] gap-[30px] flex items-center justify-center ${
						isPlaying && "hidden"
					}`}
					style={{ y: mq }}>
					<div
						className={`w-[200px] h-[200px] sm:w-[150px] sm:h-[150px] xm:w-[100px] xm:h-[100px] bg-white rounded-full flex items-center justify-center cursor-pointer ${
							!canPlay && "opacity-50 cursor-not-allowed"
						}`}
						onClick={togglePlay}>
						<div className="relative w-full h-full">
							<Image
								style={{
									transform: `rotate(${rotate}deg)`,
								}}
								src={eyes}
								alt="img"
								className="w-full h-full object-cover"
							/>
							<p className="absolute top-1/2 left-1/2 paragraph uppercase text-white font-NeueMontreal font-medium transform translate-x-[-50%] translate-y-[-50%]">
								{isLoading ? "Loading..." : isPlaying ? "Pause" : "Play"}
							</p>
						</div>
					</div>
					<div
						className={`w-[200px] sm:w-[150px] sm:h-[150px] xm:w-[100px] xm:h-[100px] bg-white rounded-full flex items-center justify-center cursor-pointer ${
							!canPlay && "opacity-50 cursor-not-allowed"
						}`}
						onClick={togglePlay}>
						<div className="relative w-full h-full">
							<Image
								style={{
									transform: `rotate(${rotate}deg)`,
								}}
								src={eyes}
								alt="img"
								className="w-full h-full object-cover"
							/>
							<p className="absolute top-1/2 left-1/2 paragraph uppercase text-white font-NeueMontreal font-medium transform translate-x-[-50%] translate-y-[-50%]">
								{isLoading ? "Loading..." : isPlaying ? "Pause" : "Play"}
							</p>
						</div>
					</div>
				</motion.div>
				<div
					onClick={togglePlay}
					className={`w-full absolute top-[50%] transform translate-y-[-50%] gap-[30px] flex items-center justify-center ${
						!isPlaying && "hidden"
					}`}>
					<button className="text-white text-[18px] bg-black px-[10px] leading-none font-normal py-[5px] font-NeueMontreal rounded-[20px]">
						pause
					</button>
				</div>
			</div>
		</div>
	);
};

// Lazy load the video player
const LazyVideoPlayer = lazy(() => Promise.resolve({ default: VideoPlayer }));

// Main export with Suspense boundary
export default function PlayVideo({ videosrc }: { videosrc: string }) {
	return (
		<Suspense fallback={<VideoPosterFallback />}>
			<LazyVideoPlayer videosrc={videosrc} />
		</Suspense>
	);
}