import React from 'react'
import Image from 'next/image'
import styles from '../index.module.css'

// Import assets
import plusIcon from '../../assets/plus-icon.svg'

export const FAQ: React.FC = () => {
    return (
        <div className={styles.frameParent67}>
        <div className={styles.popularQuestionsParent}>
          <div className={styles.features}>
            <span>{`Popular `}</span>
            <span className={styles.cryptoPlatforms}>questions</span>
          </div>
          <div className={styles.beTheFirstToUseOurCrypgoParent}>
            <div className={styles.crypgoPoweredBy}>Learn more about Discard</div>
            <div className={styles.getFasterSaferContainer1}>We accept 100+ cryptocurrencies around the world</div>
          </div>
        </div>
        <div className={styles.accordionParent}>
          <div className={styles.accordion}>
            <div className={styles.whatIsCrypgoParent}>
              <div className={styles.features}>What is Discard?</div>
              <Image className={styles.frameChild82} width={32} height={32} sizes="100vw" alt="" src={plusIcon} />
            </div>
          </div>
          <div className={styles.accordion}>
            <div className={styles.whatIsCrypgoParent}>
              <div className={styles.features}> Is Discard available worldwide?</div>
              <Image className={styles.frameChild82} width={32} height={32} sizes="100vw" alt="" src={plusIcon} />
            </div>
          </div>
          <div className={styles.accordion}>
            <div className={styles.whatIsCrypgoParent}>
              <div className={styles.features}>Which cryptocurrencies are supported on Discard?</div>
              <Image className={styles.frameChild82} width={32} height={32} sizes="100vw" alt="" src={plusIcon} />
            </div>
          </div>
          <div className={styles.accordion}>
            <div className={styles.whatIsCrypgoParent}>
              <div className={styles.features}>Is my personal information secure with Discard?</div>
              <Image className={styles.frameChild82} width={32} height={32} sizes="100vw" alt="" src={plusIcon} />
            </div>
          </div>
          <div className={styles.accordion}>
            <div className={styles.whatIsCrypgoParent}>
              <div className={styles.features}>Are there any deposit or withdrawal fees?</div>
              <Image className={styles.frameChild82} width={32} height={32} sizes="100vw" alt="" src={plusIcon} />
            </div>
          </div>
          <div className={styles.accordion}>
            <div className={styles.whatIsCrypgoParent}>
              <div className={styles.features}>Does Discard offer advanced trading tools?</div>
              <Image className={styles.frameChild82} width={32} height={32} sizes="100vw" alt="" src={plusIcon} />
            </div>
          </div>
        </div>
      </div>
    );
};