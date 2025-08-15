import React from 'react';
import { Button } from '../ui/Button';

// Import assets
const rightArrow = "D:/builds/_Projects/discard/apps/web/src/assets/a0fee52253d4a59bf5367b249d2420722f23e179.svg";
const leftArrow = "D:/builds/_Projects/discard/apps/web/src/assets/f7b9a90ff1ddb5422c67508520e29f38ddb20838.svg";

export const Newsletter: React.FC = () => {
  return (
    <section className="bg-[#000510] py-[72px] px-[50px]">
      <div className="max-w-7xl mx-auto">
        <div className="backdrop-blur-[3px] bg-[rgba(255,255,255,0.05)] rounded-2xl relative overflow-hidden">
          <div className="p-16 flex items-center justify-between">
            {/* Left Content */}
            <div className="w-[588px] space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[rgba(153,227,158,0.1)] rounded-[999px] border border-[rgba(255,255,255,0.1)]">
                <span className="text-[#99e39e] text-sm font-medium">
                  Newsletter
                </span>
              </div>
              
              <h2 className="text-white text-[40px] font-medium leading-[1.2] tracking-[-0.24px]">
                Stay updated with our newsletter
              </h2>
              
              <p className="text-[rgba(255,255,255,0.6)] text-base leading-[1.4]">
                Get the latest updates on new features, security enhancements, and crypto market insights delivered directly to your inbox.
              </p>

              {/* Email Input */}
              <div className="flex items-center gap-3">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-3 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] rounded-xl text-white placeholder-[rgba(255,255,255,0.4)] focus:outline-none focus:border-[#99e39e] transition-colors"
                />
                <Button variant="primary" size="md">
                  Subscribe
                  <div className="w-5 h-5">
                    <img src={rightArrow} alt="Right Arrow" className="w-full h-full" />
                  </div>
                </Button>
              </div>
            </div>

            {/* Right Content */}
            <div className="w-[588px] flex justify-end">
              <div className="relative">
                {/* Background Pattern */}
                <div className="w-96 h-96 opacity-20">
                  <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzg0IiBoZWlnaHQ9IjM4NCIgdmlld0JveD0iMCAwIDM4NCAzODQiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzODQiIGhlaWdodD0iMzg0IiBmaWxsPSIjOTlFMzlFIi8+CjxwYXRoIGQ9Ik0wIDBIMzg0VjM4NEgwVjBaIiBmaWxsPSIjOTlFMzlFIi8+Cjwvc3ZnPgo=" alt="Background Pattern" className="w-full h-full" />
                </div>
                
                {/* Floating Elements */}
                <div className="absolute top-10 right-10 w-16 h-16 bg-[rgba(153,227,158,0.2)] rounded-full" />
                <div className="absolute bottom-20 left-20 w-12 h-12 bg-[rgba(153,227,158,0.15)] rounded-full" />
                <div className="absolute top-32 left-32 w-8 h-8 bg-[rgba(153,227,158,0.1)] rounded-full" />
              </div>
            </div>
          </div>

          {/* Border */}
          <div className="absolute inset-0 border border-[rgba(255,255,255,0.1)] rounded-2xl pointer-events-none shadow-[0px_12px_28px_0px_rgba(10,9,9,0.32)]" />
        </div>
      </div>
    </section>
  );
};
