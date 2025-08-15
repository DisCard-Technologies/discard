import React from 'react';

// Import assets
const logoIcon = "D:/builds/_Projects/discard/apps/web/src/assets/8270f4e137d5d9bf8f72c232f6c21d496348a879.svg";
const logoText = "D:/builds/_Projects/discard/apps/web/src/assets/8e25ca4f5730d65e75e1de0b245d99f9c268cc23.svg";
const facebookIcon = "D:/builds/_Projects/discard/apps/web/src/assets/71baae3c5fbdd92698c06006bce30c474fc451e2.svg";
const instagramIcon = "D:/builds/_Projects/discard/apps/web/src/assets/cb693ec4613eac1d8b58c46d78d0b74670b3b86d.svg";
const twitterIcon = "D:/builds/_Projects/discard/apps/web/src/assets/351964b99ee0638a0acaba96bb45f7b6177b205b.svg";
const appStoreBadge = "D:/builds/_Projects/discard/apps/web/src/assets/ba012b58ca40473152fdb7f3205af0d48c4ae95c.svg";
const googlePlayBadge = "D:/builds/_Projects/discard/apps/web/src/assets/2aacc623e030cf2b91b3dce1c2c6e2a087fc2c49.svg";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#000510] px-[50px]">
      <div className="max-w-7xl mx-auto">
        {/* Main Footer Content */}
        <div className="py-20">
          <div className="flex items-start justify-between">
            {/* Left Column */}
            <div className="w-[486px] space-y-6">
              {/* Logo and Description */}
              <div className="space-y-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8">
                    <img src={logoIcon} alt="Logo Icon" className="w-full h-full" />
                  </div>
                  <div className="w-[93px] h-8">
                    <img src={logoText} alt="DisCard" className="w-full h-full" />
                  </div>
                </div>
                <p className="text-[rgba(255,255,255,0.6)] text-base leading-[1.4]">
                  Transform your crypto business with DisCard, a template for startups and blockchain services.
                </p>
              </div>

              {/* Social Media */}
              <div className="flex flex-wrap gap-2">
                <div className="w-10 h-10 bg-[rgba(255,255,255,0.1)] rounded-full p-[9px] flex items-center justify-center">
                  <img src={facebookIcon} alt="Facebook" className="w-5 h-5" />
                </div>
                <div className="w-10 h-10 bg-[rgba(255,255,255,0.1)] rounded-full p-[9px] flex items-center justify-center">
                  <img src={instagramIcon} alt="Instagram" className="w-5 h-5" />
                </div>
                <div className="w-10 h-10 bg-[rgba(255,255,255,0.1)] rounded-full p-[9px] flex items-center justify-center">
                  <img src={twitterIcon} alt="Twitter" className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Right Columns */}
            <div className="flex gap-20">
              {/* Links */}
              <div className="space-y-3">
                <h4 className="text-white text-xl font-medium tracking-[-0.4px]">Links</h4>
                <div className="space-y-2 text-[rgba(255,255,255,0.6)] text-base">
                  <div>Features</div>
                  <div>Benefits</div>
                  <div>Services</div>
                  <div>Why DisCard</div>
                  <div>FAQs</div>
                </div>
              </div>

              {/* Other Pages */}
              <div className="space-y-3">
                <h4 className="text-white text-xl font-medium tracking-[-0.4px]">Other Pages</h4>
                <div className="space-y-2 text-[rgba(255,255,255,0.6)] text-base">
                  <div>Terms</div>
                  <div>Disclosures</div>
                  <div>Latest News</div>
                </div>
              </div>

              {/* Download App */}
              <div className="space-y-4">
                <h4 className="text-white text-xl font-medium tracking-[-0.4px]">Download app</h4>
                <div className="space-y-4">
                  <div className="bg-[rgba(255,255,255,0.1)] p-[3.385px] rounded-[6.769px]">
                    <img src={appStoreBadge} alt="App Store" className="h-[37.231px] w-[126.077px]" />
                  </div>
                  <div className="bg-[rgba(255,255,255,0.1)] p-[3.692px] rounded-[7.385px]">
                    <img src={googlePlayBadge} alt="Google Play" className="h-[40.615px] w-[121.846px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="py-8 px-2 border-t border-[rgba(255,255,255,0.2)] text-center">
          <p className="text-[rgba(255,255,255,0.4)] text-sm">
            Copyright ©2025 DisCard. All rights reserved
          </p>
        </div>
      </div>
    </footer>
  );
};
