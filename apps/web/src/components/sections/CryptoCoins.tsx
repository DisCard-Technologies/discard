import React from 'react';
import Image from 'next/image';
import styles from '../index.module.css';

// Import crypto icons
import bitcoinIcon from "../../assets/bitcoin-icon.png";
import ethereumIcon from "../../assets/ethereum-icon.png";
import litecoinIcon from "../../assets/litecoin-icon.png";
import polkadotIcon from "../../assets/polkadot-icon.png";
import solanaIcon from "../../assets/solana-icon.png";
import chainlinkIcon from "../../assets/chainlink-icon.png";

export const CryptoCoins: React.FC = () => {
  return (
    <div className={styles.frameDiv}>
      <div className={styles.featuredCryptoCoinsParent}>
        <div className={styles.features}>
          <span>{`Featured `}</span>
          <span className={styles.cryptoPlatforms}>crypto coins</span>
        </div>
        <div className={styles.topCryptoCoins}>Top crypto coins updates</div>
      </div>
      <div className={styles.cardParent}>
        <div className={styles.card}>
          <div className={styles.tradeCryptocurrenciesWithContainer}>Highest volume</div>
          <Image className={styles.logoChild} width={32} height={32} sizes="100vw" alt="" src={bitcoinIcon} />
          <div className={styles.bitcoinParent}>
            <div className={styles.bitcoin}>Bitcoin</div>
            <div className={styles.parent}>
              <div className={styles.youReceive}>93575.5</div>
              <div className={styles.usd}>USD</div>
            </div>
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.tradeCryptocurrenciesWithContainer}>Top gainer</div>
          <Image className={styles.logoChild} width={32} height={32} sizes="100vw" alt="" src={ethereumIcon} />
          <div className={styles.bitcoinParent}>
            <div className={styles.bitcoin}>Ethereum</div>
            <div className={styles.parent}>
              <div className={styles.youReceive}>3337.28</div>
              <div className={styles.usd}>USD</div>
            </div>
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.tradeCryptocurrenciesWithContainer}>New listing</div>
          <Image className={styles.cardInner} width={32} height={32} sizes="100vw" alt="" src={litecoinIcon} />
          <div className={styles.bitcoinParent}>
            <div className={styles.bitcoin}>Litecoin</div>
            <div className={styles.parent}>
              <div className={styles.youReceive}>105.000</div>
              <div className={styles.usd}>USD</div>
            </div>
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.tradeCryptocurrenciesWithContainer}>Most traded</div>
          <Image className={styles.logoChild} width={32} height={32} sizes="100vw" alt="" src={polkadotIcon} />
          <div className={styles.bitcoinParent}>
            <div className={styles.bitcoin}>Polkadot</div>
            <div className={styles.parent}>
              <div className={styles.youReceive}>6.6423</div>
              <div className={styles.usd}>USD</div>
            </div>
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.tradeCryptocurrenciesWithContainer}>Biggest gainers</div>
          <Image className={styles.logoChild} width={32} height={32} sizes="100vw" alt="" src={solanaIcon} />
          <div className={styles.bitcoinParent}>
            <div className={styles.bitcoin}>Solana</div>
            <div className={styles.parent}>
              <div className={styles.youReceive}>189.63</div>
              <div className={styles.usd}>USD</div>
            </div>
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.tradeCryptocurrenciesWithContainer}>Trending</div>
          <Image className={styles.logoChild} width={32} height={32} sizes="100vw" alt="" src={chainlinkIcon} />
          <div className={styles.bitcoinParent}>
            <div className={styles.bitcoin}>Chainlink</div>
            <div className={styles.parent}>
              <div className={styles.youReceive}>19.991</div>
              <div className={styles.usd}>USD</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
