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
    <div className="headerParent">
      <div className="header">
        <div className="logo">
          <Image
            className="logoChild"
            width={32}
            height={32}
            sizes="100vw"
            alt=""
            src={logoIcon}
          />
          <Image
            className="logoItem"
            width={93}
            height={32}
            sizes="100vw"
            alt=""
            src={logoText}
          />
        </div>
        <div className="featuresParent">
          <div className="features">Features</div>
          <div className="features">Benefits</div>
          <div className="features">Services</div>
          <div className="features">Why Crypgo</div>
          <div className="features">FAQs</div>
        </div>
        <div className="button">
          <div className="getTemplate">Book a call</div>
        </div>
      </div>
    </div>
  );
};