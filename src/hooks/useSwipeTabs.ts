import React, { useRef, useState } from 'react';

interface UseSwipeTabsOptions<T extends string> {
  tabs: readonly T[];
  activeTab: T;
  onTabChange: (newTab: T) => void;
  enabled?: boolean;
  threshold?: number;
}

export function useSwipeTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  enabled = true,
  threshold = 60,
}: UseSwipeTabsOptions<T>) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const [swipeFeedback, setSwipeFeedback] = useState<'left' | 'right' | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    setSwipeFeedback(null);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!enabled || startX.current === null || startY.current === null) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - startX.current;
    const diffY = touch.clientY - startY.current;

    // Check horizontal dominance
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30) {
      setSwipeFeedback(diffX > 0 ? 'right' : 'left');
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!enabled || startX.current === null) return;
    const touch = e.changedTouches[0];
    const diffX = touch.clientX - startX.current;
    const diffY = touch.clientY - (startY.current ?? 0);

    startX.current = null;
    startY.current = null;
    setSwipeFeedback(null);

    // If horizontal swipe exceeds threshold and is significantly larger than vertical movement
    if (Math.abs(diffX) >= threshold && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      const currentIndex = tabs.indexOf(activeTab);
      if (currentIndex === -1) return;

      if (diffX < 0 && currentIndex < tabs.length - 1) {
        // Swipe left -> Next Tab
        onTabChange(tabs[currentIndex + 1]);
      } else if (diffX > 0 && currentIndex > 0) {
        // Swipe right -> Prev Tab
        onTabChange(tabs[currentIndex - 1]);
      }
    }
  };

  return {
    touchHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    swipeFeedback,
  };
}
