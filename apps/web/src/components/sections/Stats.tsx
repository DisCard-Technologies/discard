import React from 'react';

const stats = [
  {
    value: "6M+",
    label: "Active users"
  },
  {
    value: "24/7",
    label: "Users support"
  },
  {
    value: "160+",
    label: "Countries"
  },
  {
    value: "$22B+",
    label: "Trade volume"
  }
];

export const Stats: React.FC = () => {
  return (
    <section className="bg-[#000510] py-[72px]">
      <div className="max-w-7xl mx-auto px-[50px]">
        <div className="grid grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-[rgba(255,255,255,0.05)] p-[47px] rounded-2xl border border-[rgba(255,255,255,0.1)] text-center"
            >
              <div className="space-y-1">
                <div className="text-[#99e39e] text-[32px] font-medium tracking-[-0.64px]">
                  {stat.value}
                </div>
                <div className="text-[rgba(255,255,255,0.8)] text-base">
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
