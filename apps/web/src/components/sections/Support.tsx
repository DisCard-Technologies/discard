import React from 'react';

// Import support icons
const supportIcon = "D:/builds/_Projects/discard/apps/web/src/assets/1366eccfdf5417a0f63f7b87eaa813916073f078.svg";
const communityIcon = "D:/builds/_Projects/discard/apps/web/src/assets/3893ec1aba4b29b465a3175989bf03b6be3a2e05.svg";
const academyIcon = "D:/builds/_Projects/discard/apps/web/src/assets/b12644c882de9a31507c81088687e50cc4626069.svg";

const supportFeatures = [
  {
    icon: supportIcon,
    title: "24/7 Support",
    description: "Need help? Get your requests solved quickly via support team."
  },
  {
    icon: communityIcon,
    title: "Community",
    description: "Join the conversations on our worldwide DisCard communities"
  },
  {
    icon: academyIcon,
    title: "Academy",
    description: "Learn blockchain and crypto for free."
  }
];

export const Support: React.FC = () => {
  return (
    <section className="bg-[#000510] py-[72px] px-[50px]">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center space-y-3 mb-10">
          <h2 className="text-white text-base font-medium">
            Always by{' '}
            <span className="text-[#99e39e]">your side</span>
          </h2>
          <h3 className="text-white text-[40px] font-medium leading-[1.2] tracking-[-0.24px]">
            Be the first to use our DisCard!
          </h3>
          <p className="text-[rgba(255,255,255,0.6)] text-base leading-[1.4] text-center">
            Get faster, safer, more affordable cloud object storage with<br />
            no central point of failure.
          </p>
        </div>

        {/* Support Features */}
        <div className="backdrop-blur-lg bg-[rgba(255,255,255,0.05)] rounded-2xl relative overflow-hidden">
          <div className="p-16">
            <div className="flex items-center justify-between">
              {supportFeatures.map((feature, index) => (
                <div key={index} className="w-60 text-center space-y-5">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-[rgba(255,255,255,0.1)] rounded-full p-4 flex items-center justify-center mx-auto">
                    <div className="w-8 h-8">
                      <img src={feature.icon} alt={`${feature.title} Icon`} className="w-full h-full" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="space-y-2">
                    <h4 className="text-white text-xl font-medium tracking-[-0.4px]">
                      {feature.title}
                    </h4>
                    <p className="text-[rgba(255,255,255,0.6)] text-base leading-[1.4]">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Border */}
          <div className="absolute inset-0 border border-[rgba(255,255,255,0.1)] rounded-2xl pointer-events-none shadow-[0px_12px_28px_0px_rgba(10,9,9,0.32)]" />
        </div>
      </div>
    </section>
  );
};
