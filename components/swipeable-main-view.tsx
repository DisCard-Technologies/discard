import { useRef, useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { HomeScreenContent } from '@/app/(tabs)/index';
import { CardScreenContent } from '@/app/(tabs)/card';
import { PortfolioScreenContent } from '@/app/(tabs)/portfolio';

// Try to load PagerView - it's not available in Expo Go
let PagerView: typeof import('react-native-pager-view').default | null = null;
try {
  PagerView = require('react-native-pager-view').default;
} catch (e) {
  console.log('[SwipeableMainView] PagerView not available (Expo Go mode)');
}

// Page indices
const PAGE_PORTFOLIO = 0;
const PAGE_HOME = 1;
const PAGE_CARD = 2;

export function SwipeableMainView() {
  const pagerRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(PAGE_HOME);

  // Navigation callbacks for child screens
  const navigateToCard = useCallback(() => {
    pagerRef.current?.setPage(PAGE_CARD);
  }, []);

  const navigateToHome = useCallback(() => {
    pagerRef.current?.setPage(PAGE_HOME);
  }, []);

  const navigateToPortfolio = useCallback(() => {
    pagerRef.current?.setPage(PAGE_PORTFOLIO);
  }, []);

  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    setCurrentPage(e.nativeEvent.position);
  }, []);

  // Fallback for Expo Go - just render HomeScreenContent without swipe navigation
  if (!PagerView) {
    return (
      <View style={styles.pager}>
        <HomeScreenContent />
      </View>
    );
  }

  return (
    <PagerView
      ref={pagerRef}
      style={styles.pager}
      initialPage={PAGE_HOME}
      onPageSelected={handlePageSelected}
      overdrag
    >
      {/* Page 0: Portfolio Screen (swipe right from home) */}
      <View key="portfolio" style={styles.page}>
        <PortfolioScreenContent
          onNavigateToHome={navigateToHome}
          onNavigateToCard={navigateToCard}
        />
      </View>

      {/* Page 1: Home Screen (Initial) */}
      <View key="home" style={styles.page}>
        <HomeScreenContent
          onNavigateToPortfolio={navigateToPortfolio}
          onNavigateToCard={navigateToCard}
        />
      </View>

      {/* Page 2: Card Screen (swipe left from home) */}
      <View key="card" style={styles.page}>
        <CardScreenContent
          onNavigateToPortfolio={navigateToPortfolio}
          onNavigateToHome={navigateToHome}
        />
      </View>
    </PagerView>
  );
}

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
