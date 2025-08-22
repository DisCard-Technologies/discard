"use client";

import React, { useState } from 'react';
import Button from '../ui/Button';
import Image from 'next/image';
import { useScroll } from "../../lib/hooks/useScroll"
import Link from 'next/link';

// Import logo assets
import discardLogo from "../../assets/logo-1.png";

export default function Header() {
  // const { isScrolled } = useScroll()
  
  // const navItems = ["Features", "Benefits", "Services", "Why Discard", "FAQs"]

  return (
    <div className="headerParent">
      <div className="header">
        <Link href="/" className="logo">
          <Image
            className="logoItem"
            width={32}
            height={32}
            sizes="100vw"
            alt=""
            src={discardLogo}
          />
        </Link>
        
        <div className="featuresParent">
          <Link href="/features" className="features">Features</Link>
          <Link href="/benefits" className="features">Benefits</Link>
          <Link href="/services" className="features">Services</Link>
          <Link href="/why-discard" className="features">Why Discard</Link>
          <Link href="/faqs" className="features">FAQs</Link>
        </div>

        <Link href="/book-a-call" className="button">
          <div className="getTemplate">Book a call</div>
        </Link>
      </div>
    </div>
  );
};