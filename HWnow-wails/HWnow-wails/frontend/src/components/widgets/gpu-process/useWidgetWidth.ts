import { useState, useEffect, RefObject } from 'react';

/**
 * Custom hook to track widget width dynamically
 * @param widgetRef - Reference to the widget container element
 * @returns Current width of the widget in pixels
 */
export const useWidgetWidth = (widgetRef: RefObject<HTMLDivElement>): number => {
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const updateWidth = () => {
      if (widgetRef.current) {
        const rect = widgetRef.current.getBoundingClientRect();
        setWidth(rect.width);
      }
    };

    // Initial width measurement
    updateWidth();

    // Set up ResizeObserver for more accurate resize detection
    let resizeObserver: ResizeObserver | null = null;

    if (widgetRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setWidth(entry.contentRect.width);
        }
      });
      resizeObserver.observe(widgetRef.current);
    } else {
      // Fallback to window resize event if ResizeObserver is not available
      window.addEventListener('resize', updateWidth);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateWidth);
      }
    };
  }, [widgetRef]);

  return Math.floor(width);
};

/**
 * Calculate maximum process name length based on widget width
 * @param widgetWidth - Current width of the widget
 * @returns Maximum number of characters to display
 */
export const calculateMaxProcessNameLength = (widgetWidth: number): number => {
  // Base calculation: approximately 8-10 pixels per character
  // Account for other columns (PID, GPU%, Memory, Status, Actions)

  if (widgetWidth >= 1000) return 60;     // Very wide widget: 60 characters
  if (widgetWidth >= 800) return 45;      // Wide widget: 45 characters
  if (widgetWidth >= 600) return 35;      // Medium widget: 35 characters
  if (widgetWidth >= 400) return 25;      // Default widget: 25 characters
  if (widgetWidth >= 300) return 18;      // Narrow widget: 18 characters
  return 12;                              // Very narrow widget: 12 characters
};