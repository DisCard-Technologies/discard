import { useRef, useState, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeScreenContent } from '@/app/(tabs)/index';
import { CardScreenContent } from '@/app/(tabs)/card';
import { PortfolioScreenContent } from '@/app/(tabs)/portfolio';
import { TopBar, ActivePage } from '@/components/top-bar';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/stores/authConvex';
import { useCards } from '@/stores/cardsConvex';

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
  const insets = useSafeAreaInsets();

  // Get data for TopBar
  const { user } = useAuth();
  const { state: cardsState } = useCards();
  const walletAddress = user?.solanaAddress || '';
  const cardCount = cardsState?.cards?.length || 0;

  // Map page index to ActivePage type
  const activePage: ActivePage = useMemo(() => {
    switch (currentPage) {
      case PAGE_PORTFOLIO: return 'portfolio';
      case PAGE_CARD: return 'card';
      default: return 'home';
    }
  }, [currentPage]);

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

  // TopBar height for content padding
  const topBarHeight = insets.top + 64; // status bar + TopBar

  // Fallback for Expo Go - just render HomeScreenContent without swipe navigation
  if (!PagerView) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.pager}>
          <HomeScreenContent topInset={topBarHeight} />
        </View>
        {/* Floating TopBar */}
        <View style={[styles.topBarContainer, { top: insets.top }]}>
          <TopBar
            walletAddress={walletAddress}
            onPortfolioTap={navigateToPortfolio}
            onCardTap={navigateToCard}
            cardCount={cardCount}
            activePage="home"
          />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Swipeable Pages - Full screen, content extends under TopBar */}
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
            topInset={topBarHeight}
          />
        </View>

        {/* Page 1: Home Screen (Initial) */}
        <View key="home" style={styles.page}>
          <HomeScreenContent
            onNavigateToPortfolio={navigateToPortfolio}
            onNavigateToCard={navigateToCard}
            topInset={topBarHeight}
          />
        </View>

        {/* Page 2: Card Screen (swipe left from home) */}
        <View key="card" style={styles.page}>
          <CardScreenContent
            onNavigateToPortfolio={navigateToPortfolio}
            onNavigateToHome={navigateToHome}
            topInset={topBarHeight}
          />
        </View>
      </PagerView>

      {/* Floating TopBar - positioned absolutely over content */}
      <View style={[styles.topBarContainer, { top: insets.top }]}>
        <TopBar
          walletAddress={walletAddress}
          onPortfolioTap={navigateToPortfolio}
          onCardTap={navigateToCard}
          cardCount={cardCount}
          activePage={activePage}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  topBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
});
