import Image from "next/image";
import { tech, problemsolve } from "@/public";

export default function Principles() {
	return (
		<section className="w-full padding-y rounded-t-[20px] bg-background">
			<div>
				<h1 className="sub-heading padding-x font-medium font-NeueMontreal text-secondry mb-[50px]">
					Two principles we stand behind in
					<br className="sm:hidden xm:hidden" /> every part of our work:
				</h1>
			</div>
			<div className="w-full border-t border-[#21212155]">
				<div className="w-full padding-x mt-[50px] flex justify-between gap-[30px] items-center sm:flex-col xm:flex-col">
					<div className="w-[50%] sm:w-full xm:w-full flex flex-col gap-[20px]">
						<Image
							src={problemsolve}
							alt="img"
							className="w-full rounded-[15px]"
							unoptimized
						/>
						<div className="flex flex-col gap-[20px]">
							<p className="paragraph font-NeueMontreal text-secondry">
								Whether a product needs to be simple or complex,
								<br /> it must solve a real problem. We focus on
								<br /> user-centric design and data-driven insights
								<br /> to create solutions that are powerful and easy to use.
							</p>
						</div>
					</div>
					<div className="w-[50%] sm:w-full xm:w-full flex flex-col gap-[20px]">
						<Image
							src={tech}
							alt="img"
							className="h-full rounded-[15px]"
							unoptimized
						/>
						<div className="flex flex-col gap-[20px]">
							<p className="paragraph font-NeueMontreal text-secondry">
								Technology should empower, not complicate. We
								<br /> use clean code, robust architecture, and elegant
								<br /> design to create products that are reliable,
								<br /> scalable, and a joy to use.
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
