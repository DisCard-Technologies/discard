import React from 'react'
import Image from 'next/image'
import styles from '../index.module.css'

// Import assets
import facebookIcon from '../../assets/facebook-icon.svg'
import instagramIcon from '../../assets/instagram-icon.svg'
import xIcon from '../../assets/x-icon.svg'
import googlePlay from '../../assets/google-play.svg'
import appStore from '../../assets/app-store.svg'
import logo1 from '../../assets/logo-1.png'
import discardLogo from '../../assets/discard-logo.png'

export const Footer: React.FC = () => {
    return (
        <div className={styles.footer}>
        <div className={styles.frameParent73}>
          <div className={styles.frameParent74}>
            <div className={styles.logoParent}>
              <div className={styles.logo}>
                <Image className={styles.logoChild} width={32} height={32} sizes="100vw" alt="" src={logo1} />
                <Image className={styles.logoItem} width={93} height={32} sizes="100vw" alt="" src={discardLogo} />
              </div>
              <div className={styles.tradeCryptocurrenciesWithContainer}>
                <p className={styles.fastAndSecure}>{`Transform your online payments with Discard `}</p>
                <p className={styles.fastAndSecure}>Discard, a virtual card for modern consumers.</p>
              </div>
            </div>
            <div className={styles.frameParent75}>
              <Image className={styles.frameChild88} width={38} height={38} sizes="100vw" alt="" src={facebookIcon} />
              <Image className={styles.frameChild88} width={38} height={38} sizes="100vw" alt="" src={instagramIcon} />
              <Image className={styles.frameChild88} width={38} height={38} sizes="100vw" alt="" src={xIcon} />
            </div>
          </div>
          <div className={styles.frameParent76}>
            <div className={styles.linksParent}>
              <div className={styles.bitcoin}>Links</div>
              <div className={styles.featuresGroup}>
                <div className={styles.tradeCryptocurrenciesWithContainer}>Features</div>
                <div className={styles.tradeCryptocurrenciesWithContainer}>Benefits</div>
                <div className={styles.tradeCryptocurrenciesWithContainer}>Services</div>
                <div className={styles.tradeCryptocurrenciesWithContainer}>Why Discard</div>
                <div className={styles.tradeCryptocurrenciesWithContainer}>FAQs</div>
              </div>
            </div>
            <div className={styles.linksParent}>
              <div className={styles.features}>Other Pages</div>
              <div className={styles.featuresGroup}>
                <div className={styles.tradeCryptocurrenciesWithContainer}>Terms</div>
                <div className={styles.tradeCryptocurrenciesWithContainer}>Disclosures</div>
                <div className={styles.tradeCryptocurrenciesWithContainer}>Latest News</div>
              </div>
            </div>
            <div className={styles.downloadAppParent}>
              <div className={styles.features}>Download app</div>
              <div className={styles.frameParent77}>
                <Image
                  className={styles.frameChild91}
                  width={132.8}
                  height={44}
                  sizes="100vw"
                  alt=""
                  src={googlePlay}
                />
                <Image
                  className={styles.frameChild92}
                  width={129.2}
                  height={48}
                  sizes="100vw"
                  alt=""
                  src={appStore}
                />
              </div>
            </div>
          </div>
        </div>
        <div className={styles.copyright2025CrypgoAllRiWrapper}>
          <div className={styles.youReceive}>Copyright ©2025 Discard. All rights reserved</div>
        </div>
      </div>
    );
};