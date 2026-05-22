"use client";

/**
 * TopLoader — slim lime progress bar shown during Next.js route transitions.
 *
 * Works by listening for clicks on internal <a> tags (Next.js Link renders <a>),
 * starting a fake-progress animation, then hiding as soon as the new pathname mounts.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function TopLoader() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);

  // When pathname changes, navigation is complete — finish + hide the bar.
  useEffect(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setWidth(100);
    const t = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 250);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as Element)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      // Ignore: external, hash-only, same page, or missing href
      if (
        !href ||
        href.startsWith("http") ||
        href.startsWith("//") ||
        href.startsWith("#") ||
        href === pathname ||
        anchor.getAttribute("target") === "_blank"
      )
        return;

      // Start the bar
      activeRef.current = true;
      setVisible(true);
      setWidth(8);

      if (intervalRef.current) clearInterval(intervalRef.current);
      let w = 8;
      intervalRef.current = setInterval(() => {
        // Asymptotic progress — gets slower as it approaches 90%
        w = w + (88 - w) * 0.12;
        setWidth(w);
        if (w >= 87) clearInterval(intervalRef.current!);
      }, 180);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed top-0 left-0 z-[9999] h-[2px] bg-lime"
      style={{
        width: `${width}%`,
        transition: width === 100 ? "width 0.15s ease-out" : "width 0.18s ease-out",
        boxShadow: "0 0 8px 1px rgba(198,244,50,0.55)",
      }}
    />
  );
}
