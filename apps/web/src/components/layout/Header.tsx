"use client";

import React, { useState } from 'react';
import Button from '../ui/Button';
import Image from 'next/image';
import { useScroll } from "../../lib/hooks/useScroll"

// Import logo assets
const logoIcon = "D:/builds/_Projects/discard/apps/web/src/assets/8270f4e137d5d9bf8f72c232f6c21d496348a879.svg";
const logoText = "D:/builds/_Projects/discard/apps/web/src/assets/8e25ca4f5730d65e75e1de0b245d99f9c268cc23.svg";

export default function Header() {
  const { isScrolled } = useScroll()
  
  const navItems = ["Features", "Benefits", "Services", "Why Crypgo", "FAQs"]

  return (
    <header className={`
      sticky top-0 z-50 self-stretch flex flex-row items-center justify-between 
      px-[50px] py-[26px] transition-all duration-300
      ${isScrolled 
        ? 'bg-crypto-dark/90 backdrop-blur-md shadow-lg' 
        : 'bg-crypto-dark'
      }
    `}>
      <div className="bg-transparent flex flex-row items-center justify-start gap-10">
        <Image
          className="w-32 relative h-32"
          width={32}
          height={32}
          sizes="100vw"
          alt="Crypgo Logo"
          src="/generic-crypto-logo.png"
        />
        <Image
          className="w-[93px] relative h-32"
          width={93}
          height={32}
          sizes="100vw"
          alt="Crypgo"
          src="/crypgo-text-logo.png"
        />
      </div>
      
      <nav className="hidden md:flex flex-row items-center justify-start gap-32">
        {navItems.map((item) => (
          <a 
            key={item}
            href={`#${item.toLowerCase().replace(' ', '-')}`}
            className="relative tracking-[-0.02em] leading-[120%] font-medium 
                     hover:text-lightgreen-100 transition-colors cursor-pointer"
          >
            {item}
          </a>
        ))}
      </nav>
      
      <Button>Book a call</Button>
      
      {/* Mobile menu button */}
      <button className="md:hidden flex flex-col gap-1 p-2">
        <span className="w-6 h-0.5 bg-white"></span>
        <span className="w-6 h-0.5 bg-white"></span>
        <span className="w-6 h-0.5 bg-white"></span>
      </button>
    </header>
  );
};