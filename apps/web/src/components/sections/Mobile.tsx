import React from 'react'
import Image from 'next/image'
import styles from '../index.module.css'

// Import assets
import rings from '../../assets/rings-behind-phone.png'
import ethereumToken from '../../assets/ethereum-token.png'
import phoneSideButton from '../../assets/phone-side-button.png'
import deviceMostOuterBorder from '../../assets/device-most-outer-border.png'
import antennaLine from '../../assets/antenna-line.png'
import phoneSpeaker from '../../assets/phone-speaker.png'
import phoneBezel from '../../assets/phone-bezel.png'
import phoneScreen from '../../assets/phone-screen.png'
import cellularConnection from '../../assets/cellular-connection.svg'
import wifi from '../../assets/wifi.svg'
import cap from '../../assets/cap.svg'
import leftArrow from '../../assets/left-arrow.svg'
import ethereumIcon from '../../assets/ethereum-icon.svg'
import downArrow from '../../assets/down-arrow.svg'
import lineDivider from '../../assets/line-divider.svg'
import bitcoinIcon from '../../assets/bitcoin-icon.svg'
import dynamicIsland from '../../assets/dynamic-island.svg'
import bitcoinToken from '../../assets/bitcoin-token.png'
import funnelCircle from '../../assets/funnel-circle.svg'
import rocketCircle from '../../assets/rocket-circle.svg'
import prototypeCircle from '../../assets/prototype-circle.svg'
import hashCircle from '../../assets/hash-circle.svg'

// iPhone Exchange Interface Component
export const MobileApp: React.FC = () => {
  return (
    <div className={styles.frameParent13}>
      <div className={styles.featuredCryptoCoinsParent}>
        <div className={styles.features}>
          <span>{` We deliver `}</span>
          <span className={styles.cryptoPlatforms}>best solution</span>
        </div>
        <div className={styles.oneApplicationWithContainer}>
          <p className={styles.fastAndSecure}>One application with multiple options to give</p>
          <p className={styles.fastAndSecure}>{`you freedom of buying & selling`}</p>
        </div>
      </div>
      <div className={styles.imgParent}>
        <div className={styles.img}>
          <Image className={styles.imgChild} width={690} height={690} sizes="100vw" alt="" src={rings} />
          <div className={styles.wrapperImage5}>
            <Image
              className={styles.image5Icon}
              width={197.2}
              height={197.2}
              sizes="100vw"
              alt=""
              src={ethereumToken}
            />
          </div>
          <div className={styles.iphone16Teal}>
            <Image className={styles.buttonIcon} width={6.1} height={31.6} sizes="100vw" alt="" src={phoneSideButton} />
            <Image className={styles.buttonIcon1} width={6.1} height={51} sizes="100vw" alt="" src={phoneSideButton} />
            <Image className={styles.buttonIcon2} width={6.1} height={80.8} sizes="100vw" alt="" src={phoneSideButton} />
            <Image className={styles.buttonIcon3} width={6.1} height={51} sizes="100vw" alt="" src={phoneSideButton} />
            <Image
              className={styles.deviceMostOuterBorder}
              width={327.4}
              height={675.1}
              sizes="100vw"
              alt=""
              src={deviceMostOuterBorder}
            />
            <Image
              className={styles.antennaLineIcon}
              width={5}
              height={4}
              sizes="100vw"
              alt=""
              src={antennaLine}
            />
            <Image
              className={styles.antennaLineIcon1}
              width={4.8}
              height={4.8}
              sizes="100vw"
              alt=""
              src={antennaLine}
            />
            <Image
              className={styles.antennaLineIcon2}
              width={4.5}
              height={4.8}
              sizes="100vw"
              alt=""
              src={antennaLine}
            />
            <Image
              className={styles.antennaLineIcon3}
              width={4.3}
              height={4.8}
              sizes="100vw"
              alt=""
              src={antennaLine}
            />
            <Image
              className={styles.antennaLineIcon4}
              width={4}
              height={4.8}
              sizes="100vw"
              alt=""
              src={antennaLine}
            />
            <Image
              className={styles.antennaLineIcon5}
              width={4.8}
              height={4.3}
              sizes="100vw"
              alt=""
              src={antennaLine}
            />
            <Image className={styles.speakerIcon} width={68.6} height={2.8} sizes="100vw" alt="" src={phoneSpeaker} />
            <Image className={styles.bezelIcon} width={318.3} height={666} sizes="100vw" alt="" src={phoneBezel} />
            <Image className={styles.screenIcon} width={94.7} height={27.8} sizes="100vw" alt="" src={phoneScreen} />
            <div className={styles.ellipseGroup}>
              <div className={styles.ellipseDiv} />
              <div className={styles.frameChild4} />
              <div className={styles.screen} />
              <div className={styles.exchangeNowWrapper}>
                <div className={styles.getTemplate}>Exchange now</div>
              </div>
              <div className={styles.iosStatusBar}>
                <div className={styles.getTemplate}>9:41</div>
                <div className={styles.wrapper}>
                  <Image
                    className={styles.cellularConnectionIcon}
                    width={14.5}
                    height={9.3}
                    sizes="100vw"
                    alt=""
                    src={cellularConnection}
                  />
                  <Image className={styles.wifiIcon} width={13} height={9.3} sizes="100vw" alt="" src={wifi} />
                  <div className={styles.battery}>
                    <div className={styles.border} />
                    <Image className={styles.capIcon} width={1} height={3.1} sizes="100vw" alt="" src={cap} />
                    <div className={styles.capacity} />
                  </div>
                </div>
              </div>
              <div className={styles.frameParent14}>
                <div className={styles.frameParent15}>
                  <div className={styles.frameParent16}>
                    <Image
                      className={styles.frameIcon5}
                      width={17.4}
                      height={17.4}
                      sizes="100vw"
                      alt=""
                      src={leftArrow}
                    />
                    <div className={styles.getTemplate}>Exchange</div>
                  </div>
                  <div className={styles.frameParent17}>
                    <div className={styles.frameParent18}>
                      <div className={styles.youSendParent}>
                        <div className={styles.tradeCryptocurrenciesWithContainer}>You Send</div>
                        <div className={styles.div24}>******</div>
                      </div>
                      <div className={styles.allGroup}>
                        <Image
                          className={styles.allIcon1}
                          width={20}
                          height={20}
                          sizes="100vw"
                          alt=""
                          src={ethereumIcon}
                        />
                        <div className={styles.ethParent}>
                          <div className={styles.getTemplate}>ETH</div>
                          <Image
                            className={styles.frameIcon6}
                            width={10}
                            height={10}
                            sizes="100vw"
                            alt=""
                            src={downArrow}
                          />
                        </div>
                      </div>
                    </div>
                    <div className={styles.lineParent}>
                      <div className={styles.lineDiv} />
                      <Image
                        className={styles.frameIcon7}
                        width={12}
                        height={12}
                        sizes="100vw"
                        alt=""
                        src={lineDivider}
                      />
                      <div className={styles.lineDiv} />
                    </div>
                    <div className={styles.frameParent18}>
                      <div className={styles.youReceiveParent}>
                        <div className={styles.youReceive}>You Receive</div>
                        <div className={styles.div25}>******</div>
                      </div>
                      <div className={styles.allGroup}>
                        <Image
                          className={styles.allIcon1}
                          width={20}
                          height={20}
                          sizes="100vw"
                          alt=""
                          src={bitcoinIcon}
                        />
                        <div className={styles.ethParent}>
                          <div className={styles.getTemplate}>BTC</div>
                          <Image
                            className={styles.frameIcon6}
                            width={10}
                            height={10}
                            sizes="100vw"
                            alt=""
                            src={downArrow}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.frameParent20}>
                    <div className={styles.chipParent}>
                      <div className={styles.tradeCryptocurrenciesWithContainer}>Available Portfolio</div>
                      <div className={styles.frameParent21}>
                        <div className={styles.allContainer}>
                          <Image
                            className={styles.allIcon1}
                            width={20}
                            height={20}
                            sizes="100vw"
                            alt=""
                            src={ethereumIcon}
                          />
                          <div className={styles.getTemplate}>Ethereum</div>
                        </div>
                        <div className={styles.frameParent22}>
                          <Image
                            className={styles.frameIcon6}
                            width={10}
                            height={10}
                            sizes="100vw"
                            alt=""
                            src={leftArrow}
                          />
                          <div className={styles.getTemplate}>******</div>
                        </div>
                      </div>
                    </div>
                    <div className={styles.ellipseContainer}>
                      <div className={styles.frameChild6} />
                      <div className={styles.getTemplate}>1 ETH = ****** ETC</div>
                    </div>
                  </div>
                </div>
                <div className={styles.frameParent23}>
                  <div className={styles.parent10}>
                    <div className={styles.features}>💸</div>
                    <div className={styles.parent11}>
                      <div className={styles.bitcoin}>0.010%</div>
                      <div className={styles.exchangeFee}>Exchange fee</div>
                    </div>
                  </div>
                  <div className={styles.frame}>
                    <div className={styles.features}>$**</div>
                  </div>
                </div>
                <div className={styles.clickHereForContainer}>
                  <p className={styles.fastAndSecure}>
                    <span className={styles.clickHereFor}>
                      <span className={styles.clickHereFor1}>Click here for</span>
                    </span>
                    <span className={styles.termsConditions}>
                      <span className={styles.clickHereFor}>{` `}</span>
                      <span>{`Terms & Conditions`}</span>
                    </span>
                  </p>
                  <p className={styles.forThisTransaction}>For this transaction fee will be taken</p>
                </div>
              </div>
            </div>
            <Image
              className={styles.dynamicIslandIcon}
              width={94.7}
              height={27.8}
              sizes="100vw"
              alt=""
              src={dynamicIsland}
            />
          </div>
          <Image className={styles.image6Icon} width={216.9} height={216.9} sizes="100vw" alt="" src={bitcoinToken} />
        </div>
        <div className={styles.frameParent24}>
          <Image className={styles.frameChild7} width={48} height={48} sizes="100vw" alt="" src={funnelCircle} />
          <div className={styles.refinementParent}>
            <div className={styles.features}>Refinement</div>
            <div className={styles.refineImproveContainer}>
              <p className={styles.fastAndSecure}>{`Refine & improve your `}</p>
              <p className={styles.fastAndSecure}>crypto landing page</p>
            </div>
          </div>
        </div>
        <div className={styles.frameParent25}>
          <Image className={styles.frameChild7} width={48} height={48} sizes="100vw" alt="" src={rocketCircle} />
          <div className={styles.refinementParent}>
            <div className={styles.features}>Scale and support</div>
            <div className={styles.refineImproveContainer}>
              <p className={styles.fastAndSecure}>{`Deploy product live and `}</p>
              <p className={styles.fastAndSecure}>ensure expert support</p>
            </div>
          </div>
        </div>
        <div className={styles.frameParent26}>
          <div className={styles.refinementParent}>
            <div className={styles.bitcoin}>Prototype</div>
            <div className={styles.refineImproveContainer}>
              <p className={styles.fastAndSecure}>{`Build crypto website `}</p>
              <p className={styles.fastAndSecure}>test for your product</p>
            </div>
          </div>
          <Image className={styles.frameChild7} width={48} height={48} sizes="100vw" alt="" src={prototypeCircle} />
        </div>
        <div className={styles.frameParent27}>
          <div className={styles.refinementParent}>
            <div className={styles.bitcoin}>Planning</div>
            <div className={styles.refineImproveContainer}>
              <p className={styles.fastAndSecure}>{`Map the crypto projects `}</p>
              <p className={styles.fastAndSecure}>scope with framer template</p>
            </div>
          </div>
          <Image className={styles.frameChild7} width={48} height={48} sizes="100vw" alt="" src={hashCircle} />
        </div>
      </div>
    </div>
  );
};