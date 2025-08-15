import React from 'react';
import { Button } from '../ui/Button';

// Import assets
const rightArrow = "D:/builds/_Projects/discard/apps/web/src/assets/a0fee52253d4a59bf5367b249d2420722f23e179.svg";
const leftArrow = "D:/builds/_Projects/discard/apps/web/src/assets/f7b9a90ff1ddb5422c67508520e29f38ddb20838.svg";

export const Hero: React.FC = () => {
  return (
    <section className="bg-[#000510] py-[72px] px-[50px]">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between">
          {/* Left Content */}
          <div className="w-[588px] space-y-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[rgba(153,227,158,0.1)] rounded-[999px] border border-[rgba(255,255,255,0.1)]">
              <span className="text-[#99e39e] text-base font-medium">
                Future of crypto trading
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-[72px] font-medium text-white leading-[1.2] tracking-[-0.432px]">
              Fast and Secure<br />
              Cryptocurrency<br />
              Exchange
            </h1>

            {/* Description */}
            <p className="text-white text-base leading-[1.4] opacity-80">
              Trade cryptocurrencies with ease, security, and advanced<br />
              features on our cutting-edge platform.
            </p>

            {/* CTA Button */}
            <Button variant="primary" size="md" className="inline-flex items-center gap-2">
              Explore more
              <div className="w-5 h-5 overflow-hidden">
                <div className="w-full h-full relative">
                  <img src={rightArrow} alt="Right Arrow" className="absolute inset-0 w-full h-full" />
                  <img src={leftArrow} alt="Left Arrow" className="absolute inset-0 w-full h-full" />
                </div>
              </div>
            </Button>
          </div>

          {/* Right Content - Card Visualization */}
          <div className="w-[584px] h-[582px] relative">
            {/* Background Layer */}
            <div 
              className="absolute inset-0 bg-gradient-to-b from-[#00051000] from-[73.454%] to-[#000510]"
              style={{
                backgroundImage: `url('D:/builds/_Projects/discard/apps/web/src/assets/60a4f19c220d66e7d5babb226616c5062b619896.png')`,
                backgroundSize: 'auto 130.8% 132.52%',
                backgroundPosition: '0% 0%, 13.09% 21.61%'
              }}
            />
            
            {/* Stats Card */}
            <div className="absolute left-[355px] top-[51px] w-[114px] h-[114px] backdrop-blur-[20px] bg-[rgba(255,255,255,0.1)] rounded-lg shadow-[0px_4.071px_6.786px_0px_rgba(0,0,0,0.12)] flex items-center justify-center">
              <div className="text-center">
                <div className="w-[70.572px] h-[70.572px] mx-auto mb-2">
                  <div className="w-full h-full relative">
                    <img src="D:/builds/_Projects/discard/apps/web/src/assets/256d9954dab81014f5763c4914c2c514ea1ec754.svg" alt="Ellipse" className="absolute inset-[-25.29%_-33.33%_-41.38%_-33.33%] w-full h-full" />
                    <img src="D:/builds/_Projects/discard/apps/web/src/assets/a3650ef85f0e18fef3c1ad415a8b6617524c4459.svg" alt="Ellipse" className="absolute inset-0 w-full h-full" />
                  </div>
                </div>
                <span className="text-white text-xs font-semibold">+75%</span>
              </div>
            </div>

            {/* Credit Card */}
            <div className="absolute left-6 top-[270.85px] w-[227.561px] h-36 bg-[#000510] rounded-[12.169px] border border-[rgba(255,255,255,0.05)] relative overflow-hidden">
              {/* Card Content */}
              <div className="absolute inset-0 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-8">
                    <img src="D:/builds/_Projects/discard/apps/web/src/assets/d588ecefa2bfc4216ab7e3775bbf1263c8f6b050.svg" alt="Logo" className="w-full h-full" />
                  </div>
                  <div className="w-8 h-6">
                    <img src="D:/builds/_Projects/discard/apps/web/src/assets/65f235ac5733c39f24df27008c093a4e39fd7d60.svg" alt="Chip" className="w-full h-full" />
                  </div>
                </div>
                
                <div className="text-white">
                  <div className="text-base font-medium mb-2">3455 4562 7710 3507</div>
                  <div className="flex justify-between text-sm">
                    <div>
                      <div className="text-[rgba(255,255,255,0.6)] uppercase text-xs">Card holder name</div>
                      <div className="font-semibold">John Carter</div>
                    </div>
                    <div>
                      <div className="text-[rgba(255,255,255,0.6)] uppercase text-xs">Expiry date</div>
                      <div className="font-semibold">02/30</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Curve Text */}
            <div className="absolute left-6 top-6 w-[120px] h-[120px]">
              {/* This would contain the curved text "JOIN CRYPTO TRENDS • JOIN CRYPTO TRENDS" */}
              {/* For now, we'll use a placeholder */}
              <div className="text-white text-xs font-mono text-center">
                JOIN CRYPTO<br />TRENDS
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
