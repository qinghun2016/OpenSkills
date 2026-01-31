import { useEffect, useCallback } from 'react';

interface UseKeyboardNavigationOptions<T> {
  items: T[];
  selectedItem: T | null;
  onSelect: (item: T) => void;
  getItemKey: (item: T) => string;
  enabled?: boolean;
}

export function useKeyboardNavigation<T>({
  items,
  selectedItem,
  onSelect,
  getItemKey,
  enabled = true,
}: UseKeyboardNavigationOptions<T>) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || !items.length) return;

      const currentIndex = selectedItem
        ? items.findIndex((item) => getItemKey(item) === getItemKey(selectedItem))
        : -1;

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          onSelect(items[nextIndex]);
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          onSelect(items[prevIndex]);
          break;
        }
        case 'Home': {
          e.preventDefault();
          if (items.length > 0) {
            onSelect(items[0]);
          }
          break;
        }
        case 'End': {
          e.preventDefault();
          if (items.length > 0) {
            onSelect(items[items.length - 1]);
          }
          break;
        }
      }
    },
    [items, selectedItem, onSelect, getItemKey, enabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
