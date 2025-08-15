import React from 'react';

// Import crypto icons
const bitcoinIcon = "D:/builds/_Projects/discard/apps/web/src/assets/4a74a1b2f593bfe6bd04a5f664cf8ca3e76f0654.svg";
const ethereumIcon = "D:/builds/_Projects/discard/apps/web/src/assets/6b8fe6d0c5a441d1e19ba20a3b86e0516b45af58.svg";
const litecoinIcon = "D:/builds/_Projects/discard/apps/web/src/assets/a87b813106cdfb9d7c71a4914d940bf851918226.svg";
const polkadotIcon = "D:/builds/_Projects/discard/apps/web/src/assets/db05d21d5ff10bc1060fb73ff0fa38a063c5386f.svg";
const solanaIcon = "D:/builds/_Projects/discard/apps/web/src/assets/45b27237214418ddd93fa020505abd22da4bf962.svg";
const chainlinkIcon = "D:/builds/_Projects/discard/apps/web/src/assets/0b5edb43768458d708029e761926697fbcabf1ad.svg";

const cryptoData = [
  {
    label: "Highest volume",
    icon: bitcoinIcon,
    name: "Bitcoin",
    price: "93575.5",
    currency: "USD"
  },
  {
    label: "Top gainer",
    icon: ethereumIcon,
    name: "Ethereum",
    price: "3337.28",
    currency: "USD"
  },
  {
    label: "New listing",
    icon: litecoinIcon,
    name: "Litecoin",
    price: "105.000",
    currency: "USD"
  },
  {
    label: "Most traded",
    icon: polkadotIcon,
    name: "Polkadot",
    price: "6.6423",
    currency: "USD"
  },
  {
    label: "Biggest gainers",
    icon: solanaIcon,
    name: "Solana",
    price: "189.63",
    currency: "USD"
  },
  {
    label: "Trending",
    icon: chainlinkIcon,
    name: "Chainlink",
    price: "19.991",
    currency: "USD"
  }
];

export const CryptoCoins: React.FC = () => {
  return (
    <section className="bg-[#000510] py-[72px] px-[50px]">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center space-y-3 mb-10">
          <h2 className="text-white text-base font-medium">
            Featured{' '}
            <span className="text-[#99e39e]">crypto coins</span>
          </h2>
          <h3 className="text-white text-[40px] font-medium leading-[1.2] tracking-[-0.24px]">
            Top crypto coins updates
          </h3>
        </div>

        {/* Crypto Cards Grid */}
        <div className="grid grid-cols-6 gap-6">
          {cryptoData.map((crypto, index) => (
            <div
              key={index}
              className="bg-[rgba(255,255,255,0.05)] p-5 rounded-2xl border border-[rgba(255,255,255,0.1)] space-y-4"
            >
              {/* Label */}
              <div className="text-[rgba(255,255,255,0.6)] text-sm">
                {crypto.label}
              </div>

              {/* Icon */}
              <div className="w-8 h-8">
                <img src={crypto.icon} alt={`${crypto.name} Icon`} className="w-full h-full" />
              </div>

              {/* Info */}
              <div className="space-y-1">
                <div className="text-white text-base font-medium">
                  {crypto.name}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-white text-sm">{crypto.price}</span>
                  <span className="text-[rgba(255,255,255,0.6)] text-sm">{crypto.currency}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
