import React from 'react';
import Image from 'next/image';

// Import logo assets
import green from "../../assets/logoipsum-green.png";
import orange from "../../assets/logoipsum-orange.png";
import purple from "../../assets/logoipsum-purple.png";
import white from "../../assets/logoipsum-white.png";
import green2 from "../../assets/logoipsum-green2.png";

export const TrustedBy: React.FC = () => {
  return (
    <div className="frameWrapper">
      <div className="trustedByTopCryptoPlatformParent">
        <div className="features">
          <span>{`Trusted by top `}</span>
          <span className="cryptoPlatforms">crypto platforms</span>
        </div>
        <div className="frameContainer">
          <Image className="frameIcon" width={187.3} height={32} sizes="100vw" alt="" src={green} />
          <Image className="logo55Icon" width={131.1} height={32} sizes="100vw" alt="" src={orange} />
          <Image className="logo51Icon" width={130.3} height={32} sizes="100vw" alt="" src={purple} />
          <Image className="logo7Icon" width={124} height={32} sizes="100vw" alt="" src={white} />
          <Image className="logo28Icon" width={117.1} height={32} sizes="100vw" alt="" src={green2} />
          <div className="frameChild" />
        </div>
      </div>
    </div>
  );
};
