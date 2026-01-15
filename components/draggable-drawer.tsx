import { ReactNode, useCallback, useState } from 'react';
import { StyleSheet, View, Dimensions, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useThemeColor } from '@/hooks/use-theme-color';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DraggableDrawerProps {
  children: ReactNode;
  closedHeight?: number;
  openHeight?: number;
  initiallyOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

const SPRING_CONFIG = {
  damping: 30,
  stiffness: 300,
  mass: 1,
};

export function DraggableDrawer({
  children,
  closedHeight = 200,
  openHeight = 500,
  initiallyOpen = false,
  onOpenChange,
}: DraggableDrawerProps) {
  // Match the unified dock styling (same as top bar)
  const backgroundColor = useThemeColor({ light: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.08)' }, 'background');
  const borderColor = useThemeColor({ light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.1)' }, 'background');
  const handleColor = useThemeColor({ light: '#d1d5db', dark: '#4b5563' }, 'icon');

  const maxTranslate = -(openHeight - closedHeight);
  const translateY = useSharedValue(initiallyOpen ? maxTranslate : 0);
  const startY = useSharedValue(0);
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const notifyOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  }, [onOpenChange]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const newValue = startY.value + event.translationY;
      translateY.value = Math.max(maxTranslate, Math.min(0, newValue));
    })
    .onEnd((event) => {
      const velocity = event.velocityY;
      const shouldOpen = velocity < -500 || (translateY.value < maxTranslate / 2 && velocity < 200);

      if (shouldOpen) {
        translateY.value = withSpring(maxTranslate, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
        runOnJS(notifyOpenChange)(true);
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
        runOnJS(triggerHaptic)();
        runOnJS(notifyOpenChange)(false);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleHandlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isOpen) {
      translateY.value = withSpring(0, SPRING_CONFIG);
      notifyOpenChange(false);
    } else {
      translateY.value = withSpring(maxTranslate, SPRING_CONFIG);
      notifyOpenChange(true);
    }
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor,
            borderTopColor: borderColor,
            height: openHeight,
            top: SCREEN_HEIGHT - closedHeight,
          },
          animatedStyle,
        ]}
      >
        {/* Drawer Handle */}
        <Pressable style={styles.handleContainer} onPress={handleHandlePress}>
          <View style={[styles.handle, { backgroundColor: handleColor }]} />
        </Pressable>

        {/* Content */}
        <View style={styles.content}>
          {children}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 50,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
});
