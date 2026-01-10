import { useRef, useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import { HomeScreenContent } from '@/app/(tabs)/index';
import { CardScreenContent } from '@/app/(tabs)/card';
import { StrategyScreenContent } from '@/app/(tabs)/strategy';

// Page indices
const PAGE_CARD = 0;
const PAGE_HOME = 1;
const PAGE_STRATEGY = 2;

export function SwipeableMainView() {
  const pagerRef = useRef<PagerView>(null);
  const [currentPage, setCurrentPage] = useState(PAGE_HOME);

  // Navigation callbacks for child screens
  const navigateToCard = useCallback(() => {
    pagerRef.current?.setPage(PAGE_CARD);
  }, []);

  const navigateToHome = useCallback(() => {
    pagerRef.current?.setPage(PAGE_HOME);
  }, []);

  const navigateToStrategy = useCallback(() => {
    pagerRef.current?.setPage(PAGE_STRATEGY);
  }, []);

  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    setCurrentPage(e.nativeEvent.position);
  }, []);

  return (
    <PagerView
      ref={pagerRef}
      style={styles.pager}
      initialPage={PAGE_HOME}
      onPageSelected={handlePageSelected}
      overdrag
    >
      {/* Page 0: Card Screen */}
      <View key="card" style={styles.page}>
        <CardScreenContent
          onNavigateToStrategy={navigateToStrategy}
          onNavigateToHome={navigateToHome}
        />
      </View>

      {/* Page 1: Home Screen (Initial) */}
      <View key="home" style={styles.page}>
        <HomeScreenContent
          onNavigateToStrategy={navigateToStrategy}
          onNavigateToCard={navigateToCard}
        />
      </View>

      {/* Page 2: Strategy Screen */}
      <View key="strategy" style={styles.page}>
        <StrategyScreenContent
          onNavigateToHome={navigateToHome}
          onNavigateToCard={navigateToCard}
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
