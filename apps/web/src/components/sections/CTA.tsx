import React from 'react'
import Image from 'next/image'
import styles from '../index.module.css'

// Import assets
import rightArrow from '../../assets/right-arrow.svg'
import frame11 from '../../assets/frame-11.png'

export const CTA: React.FC = () => {
    return (
        <div className={styles.frameWrapper7}>
        <div className={styles.frameParent28}>
          <div className={styles.crypgoPoweredByFramerPlatfParent}>
            <div className={styles.crypgoPoweredBy}>Discard powered by visa platform</div>
            <div className={styles.refineImproveContainer}>
              <p
                className={styles.fastAndSecure}
              >{`Our virtual cards empower crypto adopters to have free, safer `}</p>
              <p className={styles.fastAndSecure}>and more trustworthy experiences</p>
            </div>
          </div>
          <div className={styles.button2}>
            <div className={styles.getTemplate}>Download app</div>
            <Image
              className={styles.rightArrowIcon}
              width={20}
              height={20}
              sizes="100vw"
              alt=""
              src={rightArrow}
            />
          </div>
          <div className={styles.wrapperFrame11}>
            <Image
              className={styles.wrapperFrame11Child}
              width={591.3}
              height={591.3}
              sizes="100vw"
              alt=""
              src={frame11}
            />
          </div>
        </div>
      </div>
    );
};