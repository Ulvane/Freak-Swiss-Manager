import { useEffect, useRef, useMemo } from "react";

interface WheelPickerProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label?: string;
}

export function WheelPicker({ value, onChange, min, max, label }: WheelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isProgrammatic = useRef(false);
  const scrollEndTimer = useRef<NodeJS.Timeout | null>(null);
  const startY = useRef(0);
  const startScrollTop = useRef(0);
  
  const options = useMemo(() => {
    const opts = [];
    opts.push({ value: 0, label: "—" }); // 0 means no limit
    for (let i = min; i <= max; i++) {
      opts.push({ value: i, label: String(i).padStart(2, '0') });
    }
    return opts;
  }, [min, max]);

  const itemHeight = 32;
  const containerHeight = itemHeight * 5; // Show 5 items

  // Sync scroll position whenever value prop changes externally
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isDragging.current) return;
    const index = options.findIndex((o) => o.value === value);
    if (index !== -1) {
      const targetTop = index * itemHeight;
      if (Math.abs(container.scrollTop - targetTop) > 1) {
        isProgrammatic.current = true;
        container.scrollTop = targetTop;
        
        // Ensure applied even if dialog transition was occurring
        const raf = requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = targetTop;
          }
          if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
          scrollEndTimer.current = setTimeout(() => {
            isProgrammatic.current = false;
          }, 80);
        });
        return () => cancelAnimationFrame(raf);
      }
    }
  }, [value, options, itemHeight]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // If programmatic or actively mouse dragging, don't trigger onChange from scroll events
    if (isProgrammatic.current || isDragging.current) return;
    const container = e.currentTarget;
    
    // Debounce scroll settle for touch and wheel scrolling
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      if (isProgrammatic.current || isDragging.current || !container) return;
      const index = Math.round(container.scrollTop / itemHeight);
      if (index >= 0 && index < options.length) {
        const selectedValue = options[index].value;
        if (selectedValue !== value) {
          onChange(selectedValue);
        }
      }
    }, 60);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only intercept mouse drag, let touch use native scroll for momentum
    if (e.pointerType !== "mouse") return;
    isDragging.current = true;
    startY.current = e.clientY;
    if (containerRef.current) {
      startScrollTop.current = containerRef.current.scrollTop;
      containerRef.current.style.scrollSnapType = "none";
      containerRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !containerRef.current) return;
    e.preventDefault();
    const deltaY = e.clientY - startY.current;
    containerRef.current.scrollTop = startScrollTop.current - deltaY;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (containerRef.current) {
      containerRef.current.releasePointerCapture(e.pointerId);
      containerRef.current.style.scrollSnapType = "y mandatory";
      
      const index = Math.max(0, Math.min(options.length - 1, Math.round(containerRef.current.scrollTop / itemHeight)));
      const targetScrollTop = index * itemHeight;
      isProgrammatic.current = true;
      containerRef.current.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
      });
      setTimeout(() => {
        isProgrammatic.current = false;
      }, 150);
      
      if (index >= 0 && index < options.length) {
        onChange(options[index].value);
      }
    }
  };

  return (
    <div className="wheel-picker-container">
      {label && <div className="wheel-picker-label">{label}</div>}
      <div
        className="wheel-picker-scroll"
        ref={containerRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ height: containerHeight }}
      >
        <div className="wheel-picker-padding" style={{ height: (containerHeight - itemHeight) / 2 }} />
        {options.map((opt) => (
          <div
            key={opt.value}
            className={`wheel-picker-item ${opt.value === value ? "active" : ""}`}
            style={{ height: itemHeight, lineHeight: `${itemHeight}px` }}
          >
            {opt.label}
          </div>
        ))}
        <div className="wheel-picker-padding" style={{ height: (containerHeight - itemHeight) / 2 }} />
      </div>
      <div className="wheel-picker-selection-overlay" style={{ height: itemHeight, top: (containerHeight - itemHeight) / 2 }} />
    </div>
  );
}
