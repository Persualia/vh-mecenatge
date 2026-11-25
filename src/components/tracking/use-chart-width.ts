"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The rendered width of the chart's box. Charts are drawn at real pixels rather than
 * scaled through a viewBox, so the labels never stretch.
 */
export function useChartWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
