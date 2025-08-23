import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

// Import assets
import card from "../../assets/card-gradient.png";
import phone from "../../assets/mobile-phone-in-hand.png";
import star from "../../assets/silver-star.png";
import arrow from "../../assets/right-arrow.svg";


export const Hero: React.FC = () => {
  return (
    <div className="frameParent">
        <div className="frameGroup">
          <div className="chipParent">
            <div className="chip">
              <div className="features">Future of privacy protection</div>
            </div>
            <div className="fastAndSecureContainer">
              <p className="fastAndSecure">{`Privacy-First Disposable `}</p>
              <p className="fastAndSecure">{`Virtual Crypto `}</p>
              <p className="fastAndSecure">Cards</p>
            </div>
            <div className="tradeCryptocurrenciesWithContainer">
              <p className="fastAndSecure">{`Create virtual cards with ease, security, and advanced `}</p>
              <p className="fastAndSecure">features on our cutting-edge platform.</p>
            </div>
          </div>
          <Link className="button1" href="/features">
            <div className="getTemplate">Explore more</div>
            <Image
              className="rightArrowIcon"
              width={20}
              height={20}
              sizes="100vw"
              alt=""
              src={arrow}
            />
          </Link>
        </div>
        <div className="layer512Parent">
          <Image className="layer512Icon" width={584} height={582} sizes="100vw" alt="" src={phone} />
          <div className="groupWrapper">
            <div className="ellipseParent">
              <div className="groupChild" />
              <div className="groupItem" />
              <div className="div">+75%</div>
            </div>
          </div>
          <Image
            className="cartGradient2"
            width={227.6}
            height={144}
            sizes="100vw"
            alt=""
            src={card}
          />
          <div className="curveText">
            <div className="j">J</div>
            <div className="o">O</div>
            <div className="i">I</div>
            <div className="n">N</div>
            <div className="div1">{` `}</div>
            <div className="c">C</div>
            <div className="r">R</div>
            <div className="y">Y</div>
            <div className="t">T</div>
            <div className="p">P</div>
            <div className="o1">O</div>
            <div className="div2">{` `}</div>
            <div className="t1">T</div>
            <div className="r1">R</div>
            <div className="e">E</div>
            <div className="n1">N</div>
            <div className="d">D</div>
            <div className="s">S</div>
            <div className="div3">{` `}</div>
            <div className="e1">E</div>
            <div className="x">X</div>
            <div className="p1">P</div>
            <div className="l">L</div>
            <div className="o2">O</div>
            <div className="r2">R</div>
            <div className="e2">E</div>
            <div className="div4">{` `}</div>
            <div className="div5">•</div>
            <div className="div6">{` `}</div>
            <div className="j1">J</div>
            <div className="o3">O</div>
            <div className="i1">I</div>
            <div className="n2">N</div>
            <div className="div7">{` `}</div>
            <div className="c1">C</div>
            <div className="r3">R</div>
            <div className="y1">Y</div>
            <div className="t2">T</div>
            <div className="p2">P</div>
            <div className="o4">O</div>
            <div className="div8">{` `}</div>
            <div className="t3">T</div>
            <div className="r4">R</div>
            <div className="e3">E</div>
            <div className="n3">N</div>
            <div className="d1">D</div>
            <div className="s1">S</div>
            <div className="div9">{` `}</div>
            <div className="e4">E</div>
            <div className="x1">X</div>
            <div className="p3">P</div>
            <div className="l1">L</div>
            <div className="o5">O</div>
            <div className="r5">R</div>
            <div className="e5">E</div>
            <div className="div10">{` `}</div>
            <div className="div11">•</div>
            <div className="wrapperVector2">
              <Image
                className="wrapperVector2Child"
                width={26.3}
                height={28.2}
                sizes="100vw"
                alt=""
                src={star}
              />
            </div>
          </div>
        </div>
      </div>
  );
};
