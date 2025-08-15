import React from 'react';

// Import feature icons
const icon1 = "D:/builds/_Projects/discard/apps/web/src/assets/aa9d9ab619a26eb5fec24d718ad796658270c59d.svg";
const icon2 = "D:/builds/_Projects/discard/apps/web/src/assets/53997ca4a8c08a2640ee40f6497233849f1daf78.svg";
const icon3 = "D:/builds/_Projects/discard/apps/web/src/assets/b28a72adc02cd4ff8940272ac0887afe02df8df1.svg";

const features = [
  {
    icon: icon1,
    title: "Designed for crypto trading platforms"
  },
  {
    icon: icon2,
    title: "Kickstart your crypto website today"
  },
  {
    icon: icon3,
    title: "Launch your blockchain platform today"
  }
];

export const Features: React.FC = () => {
  return (
    <section className="bg-[#000510] py-[72px] px-[50px]">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start gap-6">
          {/* Left Content */}
          <div className="w-[588px] space-y-10">
            {/* Section Header */}
            <div className="text-center space-y-3">
              <h2 className="text-white text-base font-medium">
                Why choose{' '}
                <span className="text-[#99e39e]">discard</span>
              </h2>
              <h3 className="text-white text-[40px] font-medium leading-[1.2] tracking-[-0.24px]">
                Features of the crypto framer mobile application
              </h3>
            </div>

            {/* Features List */}
            <div className="space-y-12">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 bg-[rgba(255,255,255,0.1)] rounded-full p-[10px] flex items-center justify-center">
                    <div className="w-5 h-5">
                      <img src={feature.icon} alt="Feature Icon" className="w-full h-full" />
                    </div>
                  </div>

                  {/* Title */}
                  <div className="text-white text-base font-medium leading-[1.2] tracking-[-0.32px]">
                    {feature.title}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Content - Mobile App Preview */}
          <div className="w-[588px] h-[410.871px] relative">
            {/* Background Image */}
            <div className="absolute inset-0">
              <img 
                src="D:/builds/_Projects/discard/apps/web/src/assets/e361a5878ebf88ed33495be0766cf1c175408c87.svg" 
                alt="Mobile App Background" 
                className="w-full h-full object-cover"
              />
            </div>

            {/* Portfolio Card */}
            <div className="absolute left-[109px] top-0 w-[371px] backdrop-blur-lg bg-[rgba(255,255,255,0.05)] p-8 rounded-2xl border border-[rgba(255,255,255,0.1)] shadow-[0px_12px_28px_0px_rgba(10,9,9,0.32)]">
              <div className="space-y-8">
                {/* Header */}
                <div className="text-white text-xl font-medium">
                  Your portfolio is up{' '}
                  <span className="text-[#99e39e]">2.31%</span>
                </div>

                {/* Crypto List */}
                <div className="space-y-8">
                  {/* Bitcoin */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12">
                        <img src="D:/builds/_Projects/discard/apps/web/src/assets/7deedee87d073db3f28a2cc6efbb7b63b67cb3ee.svg" alt="Bitcoin" className="w-full h-full" />
                      </div>
                      <div>
                        <div className="text-white text-base font-semibold">Bitcoin</div>
                        <div className="text-[rgba(255,255,255,0.8)] text-sm">BTC/USD</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[#99e39e] text-base font-medium">1.05%</span>
                      <div className="w-5 h-5">
                        <img src="D:/builds/_Projects/discard/apps/web/src/assets/7b7cda864a5ba06f623259c94eae48089ffaade5.svg" alt="Up Arrow" className="w-full h-full" />
                      </div>
                    </div>
                  </div>

                  {/* Ethereum */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12">
                        <img src="D:/builds/_Projects/discard/apps/web/src/assets/8572d07bed27e15380d37c4e5f1cdd18e95de02e.svg" alt="Ethereum" className="w-full h-full" />
                      </div>
                      <div>
                        <div className="text-white text-base font-semibold">Ethereum</div>
                        <div className="text-[rgba(255,255,255,0.8)] text-sm">ETH/USD</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[#99e39e] text-base font-medium">1.05%</span>
                      <div className="w-5 h-5">
                        <img src="D:/builds/_Projects/discard/apps/web/src/assets/7b7cda864a5ba06f623259c94eae48089ffaade5.svg" alt="Up Arrow" className="w-full h-full" />
                      </div>
                    </div>
                  </div>

                  {/* Litecoin */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12">
                        <img src="D:/builds/_Projects/discard/apps/web/src/assets/b74c368d4d68be2badfe5b6d23aac774710e63e2.svg" alt="Litecoin" className="w-full h-full" />
                      </div>
                      <div>
                        <div className="text-white text-base font-semibold">Litecoin</div>
                        <div className="text-[rgba(255,255,255,0.8)] text-sm">LTC/USD</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[#99e39e] text-base font-medium">1.05%</span>
                      <div className="w-5 h-5">
                        <img src="D:/builds/_Projects/discard/apps/web/src/assets/7b7cda864a5ba06f623259c94eae48089ffaade5.svg" alt="Up Arrow" className="w-full h-full" />
                      </div>
                    </div>
                  </div>

                  {/* Polkadot */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12">
                        <img src="D:/builds/_Projects/discard/apps/web/src/assets/66ca8ca45eb743bb76a26885508e1d049684d67a.svg" alt="Polkadot" className="w-full h-full" />
                      </div>
                      <div>
                        <div className="text-white text-base font-semibold">Polkadot</div>
                        <div className="text-[rgba(255,255,255,0.8)] text-sm">DOT/USD</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[#99e39e] text-base font-medium">1.05%</span>
                      <div className="w-5 h-5">
                        <img src="D:/builds/_Projects/discard/apps/web/src/assets/7b7cda864a5ba06f623259c94eae48089ffaade5.svg" alt="Up Arrow" className="w-full h-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
