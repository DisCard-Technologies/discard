import React from 'react'
import Image from 'next/image'
import styles from '../index.module.css'

// Import assets
import ellipse17 from '../../assets/ellipse-17.svg'
import ellipse18 from '../../assets/ellipse-18.svg'
import group58 from '../../assets/group-58.png'
import group57 from '../../assets/group-57.png'
import bitcoinHalo from '../../assets/bitcoin-halo.svg'
import whiteCircleRightArrow from '../../assets/white-circle-right-arrow.svg'
import ethereumHalo from '../../assets/ethereum-halo.svg'
import avalanche from '../../assets/avalanche.svg'
import polkadot from '../../assets/polkadot.svg'
import pieChartCircle from '../../assets/pie-chart-circle.svg'
import shieldCircle from '../../assets/shield-circle.svg'
import mobileCircle from '../../assets/mobile-circle.svg'

export const Portfolio: React.FC = () => {
    return (
        <div className={styles.frameParent29}>
        <div className={styles.groupContainer}>
          <div className={styles.wrapperEllipse17Parent}>
            <div className={styles.wrapperEllipse17}>
              <Image
                className={styles.wrapperEllipse17Child}
                width={215.2}
                height={215.2}
                sizes="100vw"
                alt=""
                src={ellipse17}
              />
            </div>
            <div className={styles.wrapperEllipse18}>
              <Image
                className={styles.wrapperEllipse18Child}
                width={215.2}
                height={215.2}
                sizes="100vw"
                alt=""
                src={ellipse18}
              />
            </div>
            <Image className={styles.groupInner} width={256.7} height={257.5} sizes="100vw" alt="" src={group58} />
            <Image
              className={styles.groupChild1}
              width={256.7}
              height={257.5}
              sizes="100vw"
              alt=""
              src={group57}
            />
            <div className={styles.frameParent30}>
              <div className={styles.frameParent31}>
                <div className={styles.ethereumGroup}>
                  <div className={styles.features}>Bitcoin</div>
                  <div className={styles.btcGroup}>
                    <div className={styles.youReceive}>BTC</div>
                    <div className={styles.usd}>USD</div>
                  </div>
                </div>
                <div className={styles.parent12}>
                  <div className={styles.bitcoin}>******</div>
                  <div className={styles.div31}>7.68% (***)</div>
                </div>
              </div>
              <Image
                className={styles.frameChild11}
                width={63.2}
                height={63.2}
                sizes="100vw"
                alt=""
                src={bitcoinHalo}
              />
              <Image
                className={styles.frameChild12}
                width={41.2}
                height={41.2}
                sizes="100vw"
                alt=""
                src={whiteCircleRightArrow}
              />
            </div>
            <div className={styles.frameParent32}>
              <div className={styles.frameParent31}>
                <div className={styles.ethereumGroup}>
                  <div className={styles.features}>Ethereum</div>
                  <div className={styles.btcGroup}>
                    <div className={styles.youReceive}>ETH</div>
                    <div className={styles.usd}>USD</div>
                  </div>
                </div>
                <div className={styles.parent12}>
                  <div className={styles.bitcoin}>******</div>
                  <div className={styles.div31}>5.23% (***)</div>
                </div>
              </div>
              <Image
                className={styles.frameChild11}
                width={63.2}
                height={63.2}
                sizes="100vw"
                alt=""
                src={ethereumHalo}
              />
              <Image
                className={styles.frameChild12}
                width={41.2}
                height={41.2}
                sizes="100vw"
                alt=""
                src={whiteCircleRightArrow}
              />
            </div>
            <Image
              className={styles.groupChild2}
              width={105.8}
              height={105.8}
              sizes="100vw"
              alt=""
              src={avalanche}
            />
            <Image
              className={styles.groupChild3}
              width={105.8}
              height={105.8}
              sizes="100vw"
              alt=""
              src={polkadot}
            />
          </div>
        </div>
        <div className={styles.frameParent34}>
          <div className={styles.chipParent}>
            <div className={styles.bitcoin}>
              <span>{`Discard virtual card `}</span>
              <span className={styles.cryptoPlatforms}>platform</span>
            </div>
            <div className={styles.topCryptoCoins}>
              <p className={styles.fastAndSecure}>{`Create your cryptocurrency `}</p>
              <p className={styles.fastAndSecure}>portfolio today</p>
            </div>
            <div className={styles.coinbaseHasAContainer}>
              <p
                className={styles.fastAndSecure}
              >{`Coinbase has a variety of features that make it the best place `}</p>
              <p className={styles.fastAndSecure}>to start trading.</p>
            </div>
          </div>
          <div className={styles.frameParent35}>
            <div className={styles.frameParent36}>
              <Image className={styles.frameChild7} width={48} height={48} sizes="100vw" alt="" src={pieChartCircle} />
              <div className={styles.features}>Manage your portfolio</div>
            </div>
            <div className={styles.frameChild16} />
            <div className={styles.frameParent36}>
              <Image className={styles.frameChild7} width={48} height={48} sizes="100vw" alt="" src={shieldCircle} />
              <div className={styles.features}>Vault protection</div>
            </div>
            <div className={styles.frameChild16} />
            <div className={styles.frameParent36}>
              <Image className={styles.frameChild7} width={48} height={48} sizes="100vw" alt="" src={mobileCircle} />
              <div className={styles.features}>Mobile apps</div>
            </div>
          </div>
        </div>
      </div>
    );
};