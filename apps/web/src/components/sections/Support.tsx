import React from 'react';
import Image from 'next/image'
import styles from '../index.module.css'

// Import assets
import chartUnderVector from '../../assets/chart-under-vector.svg'
import chartLineVector from '../../assets/chart-line-vector.svg'
import headset from '../../assets/headset-circle.svg'
import usersCircle from '../../assets/users-circle.svg'
import bookCircle from '../../assets/book-circle.svg'

export const Support: React.FC = () => {
  return (
    <div className={styles.frameParent67}>
      <div className={styles.featuredCryptoCoinsParent}>
        <div className={styles.features}>
          <span>{`Always by `}</span>
          <span className={styles.cryptoPlatforms}>your side</span>
        </div>
        <div className={styles.beTheFirstToUseOurCrypgoParent}>
          <div className={styles.crypgoPoweredBy}>Be the first to use our Discard!</div>
          <div className={styles.getFasterSaferContainer1}>
            <p className={styles.fastAndSecure}>{`Get faster, safer, more affordable virtual cards with `}</p>
            <p className={styles.fastAndSecure}>no central point of failure.</p>
          </div>
        </div>
      </div>
      <div className={styles.frameFrame}>
        <div className={styles.frame1}>
          <Image className={styles.vectorIcon} width={1211} height={195.9} sizes="100vw" alt="" src={chartUnderVector} />
          <Image className={styles.vectorIcon1} width={1212} height={201} sizes="100vw" alt="" src={chartLineVector} />
          <div className={styles.frameParent68}>
            <div className={styles.frameParent69}>
              <Image className={styles.frameChild79} width={64} height={64} sizes="100vw" alt="" src={headset} />
              <div className={styles.supportParent}>
                <div className={styles.features}>24/7 Support</div>
                <div className={styles.refineImproveContainer}>
                  <p className={styles.fastAndSecure}>{`Need help? Get your requests `}</p>
                  <p className={styles.fastAndSecure}>solved quickly via support team.</p>
                </div>
              </div>
            </div>
            <div className={styles.frameParent69}>
              <Image className={styles.frameChild79} width={64} height={64} sizes="100vw" alt="" src={usersCircle} />
              <div className={styles.supportParent}>
                <div className={styles.features}>Community</div>
                <div className={styles.refineImproveContainer}>
                  <p className={styles.fastAndSecure}>{`Join the conversations on our `}</p>
                  <p className={styles.fastAndSecure}>worldwide OKEx communities</p>
                </div>
              </div>
            </div>
            <div className={styles.frameParent69}>
              <Image className={styles.frameChild79} width={64} height={64} sizes="100vw" alt="" src={bookCircle} />
              <div className={styles.supportParent}>
                <div className={styles.features}>Academy</div>
                <div className={styles.learnBlockchainAndContainer}>
                  <p className={styles.fastAndSecure}>{`Learn blockchain and `}</p>
                  <p className={styles.fastAndSecure}>crypto for free.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
