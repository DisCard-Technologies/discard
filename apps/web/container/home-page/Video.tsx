import { Suspense } from "react";
import { PlayVideo } from "@/components";

export default function Video() {
	return (
		<Suspense fallback={<div>Loading...</div>}>
			<PlayVideo videosrc="/homevideo.mp4" />
		</Suspense>
	);
}
