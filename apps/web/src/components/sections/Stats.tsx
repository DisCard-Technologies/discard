import React from 'react';
import styles from '../index.module.css';

export const Stats: React.FC = () => {
  return (
    <div className={styles.frameWrapper1}>
      <div className={styles.frameWrapper2}>
        <div className={styles.frameParent12}>
          <div className={styles.frameWrapper3}>
            <div className={styles.mParent}>
              <div className={styles.features}>6M+</div>
              <div className={styles.activeUsers}>Active users</div>
            </div>
          </div>
          <div className={styles.frameWrapper3}>
            <div className={styles.mParent}>
              <div className={styles.features}>{`24/7 `}</div>
              <div className={styles.activeUsers}>Users support</div>
            </div>
          </div>
          <div className={styles.frameWrapper3}>
            <div className={styles.mParent}>
              <div className={styles.features}>160+</div>
              <div className={styles.activeUsers}>Countries</div>
            </div>
          </div>
          <div className={styles.frameWrapper3}>
            <div className={styles.mParent}>
              <div className={styles.features}>$22B+</div>
              <div className={styles.activeUsers}>Trade volume</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
