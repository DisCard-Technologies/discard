import React from 'react';
import { Button } from '../ui/Button';

// Import assets
const rightArrow = "D:/builds/_Projects/discard/apps/web/src/assets/a0fee52253d4a59bf5367b249d2420722f23e179.svg";
const leftArrow = "D:/builds/_Projects/discard/apps/web/src/assets/f7b9a90ff1ddb5422c67508520e29f38ddb20838.svg";
const backgroundPattern = "D:/builds/_Projects/discard/apps/web/src/assets/81f75be6a66bb42f82a1a91f9064cbae3bc6713f.svg";

export const CTA: React.FC = () => {
  return (
    <section className="bg-[#000510] py-[72px] px-[50px]">
      <div className="max-w-7xl mx-auto">
        <div className="backdrop-blur-[3px] bg-[rgba(255,255,255,0.05)] rounded-2xl relative overflow-hidden">
          <div className="p-16 flex items-center justify-between">
            {/* Left Content */}
            <div className="space-y-3">
              <h2 className="text-white text-[40px] font-medium leading-[1.2] tracking-[-0.24px]">
                DisCard powered by framer platform
              </h2>
              <p className="text-[rgba(255,255,255,0.6)] text-base leading-[1.4]">
                Our landing page empower framer developers to have free, safer<br />
                and more trustworthy experiences
              </p>
            </div>

            {/* Right Content - CTA Button */}
            <Button variant="primary" size="md" className="inline-flex items-center gap-2">
              Get template
              <div className="w-5 h-5 overflow-hidden">
                <div className="w-full h-full relative">
                  <img src={rightArrow} alt="Right Arrow" className="absolute inset-0 w-full h-full" />
                  <img src={leftArrow} alt="Left Arrow" className="absolute inset-0 w-full h-full" />
                </div>
              </div>
            </Button>

            {/* Background Pattern */}
            <div className="absolute right-0 top-[-179.74px] w-[591.297px] h-[591.297px] opacity-5">
              <img src={backgroundPattern} alt="Background Pattern" className="w-full h-full" />
            </div>
          </div>

          {/* Border */}
          <div className="absolute inset-0 border border-[rgba(255,255,255,0.1)] rounded-2xl pointer-events-none shadow-[0px_12px_28px_0px_rgba(10,9,9,0.32)]" />
        </div>
      </div>
    </section>
  );
};
