import { useState, useRef, useCallback } from "react";
import { clampComparisonPosition } from "@/lib/imageCompare";

interface BeforeAfterSliderProps {
  before: string;
  after: string;
  afterStyle?: React.CSSProperties;
}

const BeforeAfterSlider = ({ before, after, afterStyle }: BeforeAfterSliderProps) => {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition(clampComparisonPosition((x / rect.width) * 100));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const safePosition = clampComparisonPosition(position);

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[4/3] rounded-xl overflow-hidden cursor-col-resize select-none glow-border"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* After (full) */}
      <img src={after} alt="Depois" className="absolute inset-0 w-full h-full object-cover" style={afterStyle} />

      {/* Before (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - safePosition}% 0 0)` }}
      >
        <img src={before} alt="Antes" className="absolute inset-0 w-full h-full object-cover" />
      </div>

      {/* Divider line */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/80" style={{ left: `${safePosition}%`, transform: 'translateX(-50%)' }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-foreground/90 flex items-center justify-center shadow-lg">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7 4L3 10L7 16M13 4L17 10L13 16" stroke="hsl(var(--background))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span className="absolute top-3 left-3 text-xs font-semibold bg-background/70 backdrop-blur-sm px-2 py-1 rounded-md">Antes</span>
      <span className="absolute top-3 right-3 text-xs font-semibold bg-primary/90 text-primary-foreground px-2 py-1 rounded-md">Depois</span>
    </div>
  );
};

export default BeforeAfterSlider;
