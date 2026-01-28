import React, { useCallback } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { PressableScale } from 'pressto';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { useThemeColor } from '@/hooks/use-theme-color';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 1 };

export interface TokenDrawerProps {
  closedHeight?: number;
  openHeightRatio?: number;
  children: React.ReactNode;
  bottomInset?: number;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export function TokenDrawer({
  closedHeight = 380,
  openHeightRatio = 0.88,
  children,
  bottomInset = 0,
  isOpen = false,
  onOpenChange,
}: TokenDrawerProps) {
  const drawerBg = useThemeColor({ light: '#ffffff', dark: '#1c1c1e' }, 'background');
  const borderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' },
    'background'
  );
  const mutedColor = useThemeColor({ light: '#687076', dark: '#9BA1A6' }, 'icon');

  const openHeight = SCREEN_HEIGHT * openHeightRatio;
  const maxTranslate = -(openHeight - closedHeight);

  const drawerTranslateY = useSharedValue(isOpen ? maxTranslate : 0);
  const startDragY = useSharedValue(0);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const notifyChange = useCallback((open: boolean) => {
    onOpenChange?.(open);
  }, [onOpenChange]);

  const handlePanGesture = Gesture.Pan()
    .onStart(() => {
      startDragY.value = drawerTranslateY.value;
    })
    .onUpdate((event) => {
      const newValue = startDragY.value + event.translationY;
      drawerTranslateY.value = Math.max(maxTranslate, Math.min(0, newValue));
    })
    .onEnd((event) => {
      const velocity = event.velocityY;
      const shouldOpen = velocity < -500 || (drawerTranslateY.value < maxTranslate / 2 && velocity < 200);

      if (shouldOpen) {
        drawerTranslateY.value = withSpring(maxTranslate, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
        runOnJS(notifyChange)(true);
      } else {
        drawerTranslateY.value = withSpring(0, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
        runOnJS(notifyChange)(false);
      }
    });

  const scrollGesture = Gesture.Native();

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drawerTranslateY.value }],
  }));

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newIsOpen = drawerTranslateY.value === 0;
    drawerTranslateY.value = withSpring(newIsOpen ? maxTranslate : 0, SPRING_CONFIG);
    onOpenChange?.(newIsOpen);
  };

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          backgroundColor: drawerBg,
          borderTopColor: borderColor,
          height: openHeight,
          top: SCREEN_HEIGHT - closedHeight - bottomInset,
        },
        drawerAnimatedStyle,
      ]}
    >
      <GestureDetector gesture={handlePanGesture}>
        <Animated.View>
          <PressableScale style={styles.handle} onPress={handleToggle}>
            <View style={[styles.handleBar, { backgroundColor: mutedColor }]} />
          </PressableScale>
        </Animated.View>
      </GestureDetector>

      <GestureDetector gesture={scrollGesture}>
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={true}
          nestedScrollEnabled={true}
          contentContainerStyle={styles.contentContainer}
        >
          {children}
        </ScrollView>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 50,
  },
  handle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contentContainer: {
    paddingBottom: 80,
  },
});
