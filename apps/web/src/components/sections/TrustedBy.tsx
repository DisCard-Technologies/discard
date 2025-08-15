import React from 'react';

// Import logo assets
const logo1 = "D:/builds/_Projects/discard/apps/web/src/assets/c4b1c6cfbe6758014e1a74f6459582d8d03aaa0b.svg";
const logo2 = "D:/builds/_Projects/discard/apps/web/src/assets/d066af173a0ee1a0c508d8968871542b6c2da113.svg";
const logo3 = "D:/builds/_Projects/discard/apps/web/src/assets/b42c8edffbe7e8dcfae3293bcf7d5d5a9444814d.svg";
const logo4 = "D:/builds/_Projects/discard/apps/web/src/assets/4f50af127c503bf4502e16958306587f322f133b.svg";
const logo5 = "D:/builds/_Projects/discard/apps/web/src/assets/86d45e4c1bea479b8b0b36070640953c3f23970d.svg";

export const TrustedBy: React.FC = () => {
  return (
    <section className="bg-[#000510] py-[72px]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center space-y-10">
          {/* Heading */}
          <div className="space-y-3">
            <h2 className="text-white text-base font-medium">
              Trusted by top{' '}
              <span className="text-[#99e39e]">crypto platforms</span>
            </h2>
          </div>

          {/* Logos */}
          <div className="flex items-center justify-center gap-[72px]">
            <div className="h-8 w-[187.317px]">
              <img src={logo1} alt="Partner Logo 1" className="w-full h-full object-contain" />
            </div>
            <div className="h-8 w-[131.122px]">
              <img src={logo2} alt="Partner Logo 2" className="w-full h-full object-contain" />
            </div>
            <div className="h-8 w-[130.341px]">
              <img src={logo3} alt="Partner Logo 3" className="w-full h-full object-contain" />
            </div>
            <div className="h-8 w-[124px]">
              <img src={logo4} alt="Partner Logo 4" className="w-full h-full object-contain" />
            </div>
            <div className="h-8 w-[117.091px]">
              <img src={logo5} alt="Partner Logo 5" className="w-full h-full object-contain" />
            </div>
          </div>

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#000510] from-[10.875%] via-[#00051000] via-[51.042%] to-[#000510] to-[91.208%] w-[1200px] h-8 mx-auto" />
        </div>
      </div>
    </section>
  );
};
