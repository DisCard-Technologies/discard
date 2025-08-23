import React from 'react';
import styles from '../index.module.css';

export const Stats: React.FC = () => {
  return (
    <div className={styles.frameWrapper1}>
      <div className={styles.frameWrapper2}>
        <div className={styles.frameParent12}>
          <div className={styles.frameWrapper3}>
            <div className={styles.mParent}>
              <div className={styles.features}>5+</div>
              <div className={styles.activeUsers}>Major cryptos supported</div>
            </div>
          </div>
          <div className={styles.frameWrapper3}>
            <div className={styles.mParent}>
              <div className={styles.features}>{`100% `}</div>
              <div className={styles.activeUsers}>Transaction Isolation</div>
            </div>
          </div>
          <div className={styles.frameWrapper3}>
            <div className={styles.mParent}>
              <div className={styles.features}>0</div>
              <div className={styles.activeUsers}>Data Correlation</div>
            </div>
          </div>
          <div className={styles.frameWrapper3}>
            <div className={styles.mParent}>
              <div className={styles.features}>$0</div>
              <div className={styles.activeUsers}>Privacy Compromise</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
