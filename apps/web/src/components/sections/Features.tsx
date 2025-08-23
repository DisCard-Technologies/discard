import React from 'react';
import Image from 'next/image';
import styles from '../index.module.css';

// Import feature icons
import bitcoinIcon from "../../assets/bitcoin-icon.png";
import ethereumIcon from "../../assets/ethereum-icon.png";
import litecoinIcon from "../../assets/litecoin-icon.png";
import polkadotIcon from "../../assets/polkadot-icon.png";
import upArrowIcon from "../../assets/up-arrow.png";
import trendLines from "../../assets/trend-lines.png";
import linkIcon from "../../assets/link-icon.png";
import boltIcon from "../../assets/bolt-icon.png";
import gearIcon from "../../assets/gear-icon.png";

export const Features: React.FC = () => {
  return (
    <div className={styles.frameParent}>
      <div className={styles.frameGroup}>
        <div className={styles.featuredCryptoCoinsParent}>
          <div className={styles.bitcoin}>
            <span>{`Why choose `}</span>
            <span className={styles.cryptoPlatforms}>Discard</span>
          </div>
          <div className={styles.featuresOfThe}>Features of the Discard mobile application</div>
        </div>
        <div className={styles.frameParent3}>
          <div className={styles.frameParent4}>
            <Image className={styles.frameItem} width={40} height={40} sizes="100vw" alt="" src={linkIcon} />
            <div className={styles.features}>
              <p className={styles.fastAndSecure}>{`Your privacy shield `}</p>
              <p className={styles.fastAndSecure}>for crypto spending</p>
            </div>
          </div>
          <div className={styles.frameParent4}>
            <Image className={styles.frameItem} width={40} height={40} sizes="100vw" alt="" src={boltIcon} />
            <div className={styles.features}>
              <p className={styles.fastAndSecure}>{`Designed for everyday `}</p>
              <p className={styles.fastAndSecure}>transactions</p>
            </div>
          </div>
          <div className={styles.frameParent4}>
            <Image className={styles.frameItem} width={40} height={40} sizes="100vw" alt="" src={gearIcon} />
            <div className={styles.features}>
              <p className={styles.fastAndSecure}>{`Fund with crypto `}</p>
              <p className={styles.fastAndSecure}>spend anywhere</p>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.groupParent}>
        <Image className={styles.frameChild2} width={588} height={324.6} sizes="100vw" alt="" src={trendLines} />
        <div className={styles.yourPortfolioIsUp231Parent}>
          <div className={styles.bitcoin}>
            <span>{`Your portfolio is up `}</span>
            <span className={styles.cryptoPlatforms}>2.31%</span>
          </div>
          <div className={styles.frameParent7}>
            <div className={styles.frameParent8}>
              <div className={styles.allParent}>
                <Image className={styles.bitcoinIcon} width={48} height={48} sizes="100vw" alt="" src={bitcoinIcon} />
                <div className={styles.ethereumParent}>
                  <div className={styles.ethereum}>Bitcoin</div>
                  <div className={styles.btcusd}>BTC/USD</div>
                </div>
              </div>
              <div className={styles.parent4}>
                <div className={styles.features}>1.05%</div>
                <Image
                  className={styles.rightArrowIcon}
                  width={20}
                  height={20}
                  sizes="100vw"
                  alt=""
                  src={upArrowIcon}
                />
              </div>
            </div>
            <div className={styles.frameParent8}>
              <div className={styles.allParent}>
                <Image className={styles.bitcoinIcon} width={48} height={48} sizes="100vw" alt="" src={ethereumIcon} />
                <div className={styles.ethereumParent}>
                  <div className={styles.ethereum}>Ethereum</div>
                  <div className={styles.btcusd}>BTC/USD</div>
                </div>
              </div>
              <div className={styles.parent4}>
                <div className={styles.features}>1.05%</div>
                <Image
                  className={styles.rightArrowIcon}
                  width={20}
                  height={20}
                  sizes="100vw"
                  alt=""
                  src={upArrowIcon}
                />
              </div>
            </div>
            <div className={styles.frameParent8}>
              <div className={styles.allParent}>
                <Image
                  className={styles.litecoinIcon1}
                  width={48}
                  height={48}
                  sizes="100vw"
                  alt=""
                  src={litecoinIcon}
                />
                <div className={styles.ethereumParent}>
                  <div className={styles.ethereum}>Litecoin</div>
                  <div className={styles.btcusd}>BTC/USD</div>
                </div>
              </div>
              <div className={styles.parent4}>
                <div className={styles.features}>1.05%</div>
                <Image
                  className={styles.rightArrowIcon}
                  width={20}
                  height={20}
                  sizes="100vw"
                  alt=""
                  src={upArrowIcon}
                />
              </div>
            </div>
            <div className={styles.frameParent8}>
              <div className={styles.allParent}>
                <Image
                  className={styles.bitcoinIcon}
                  width={48}
                  height={48}
                  sizes="100vw"
                  alt=""
                  src={polkadotIcon}
                />
                <div className={styles.ethereumParent}>
                  <div className={styles.ethereum}>Polkadot</div>
                  <div className={styles.btcusd}>BTC/USD</div>
                </div>
              </div>
              <div className={styles.parent4}>
                <div className={styles.features}>1.05%</div>
                <Image
                  className={styles.rightArrowIcon}
                  width={20}
                  height={20}
                  sizes="100vw"
                  alt=""
                  src={upArrowIcon}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
