import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

type Position = { x: number; y: number };

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

const EDGE_GAP = 8;

function clampPosition(element: HTMLElement, position: Position): Position {
  const rect = element.getBoundingClientRect();
  const maxX = Math.max(EDGE_GAP, window.innerWidth - rect.width - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, window.innerHeight - rect.height - EDGE_GAP);
  return {
    x: Math.min(maxX, Math.max(EDGE_GAP, position.x)),
    y: Math.min(maxY, Math.max(EDGE_GAP, position.y)),
  };
}

function readStoredPosition(storageKey: string): Position | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: Number(parsed.x), y: Number(parsed.y) };
  } catch {
    return null;
  }
}

function saveStoredPosition(storageKey: string, position: Position) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(position));
  } catch {
    // Storage can be blocked in hardened/private browser sessions. Dragging
    // still works for the current session even when persistence is unavailable.
  }
}

/**
 * Makes a fixed floating panel movable without changing its normal default
 * placement until the user drags it. The final position is persisted locally
 * per browser, clamped to the visible viewport, and restored on reload.
 */
export function useFloatingPosition(storageKey: string): {
  panelRef: RefObject<HTMLDivElement | null>;
  floatingStyle: CSSProperties | undefined;
  dragging: boolean;
  dragHandleProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
    style: CSSProperties;
  };
  reclamp: () => void;
} {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const positionRef = useRef<Position | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);

  const updatePosition = useCallback((next: Position | null) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  const commit = useCallback(
    (next: Position) => {
      const element = panelRef.current;
      if (!element) return;
      const clamped = clampPosition(element, next);
      updatePosition(clamped);
      saveStoredPosition(storageKey, clamped);
    },
    [storageKey, updatePosition],
  );

  const reclamp = useCallback(() => {
    const element = panelRef.current;
    if (!element || !position) return;
    const clamped = clampPosition(element, position);
    if (clamped.x !== position.x || clamped.y !== position.y) {
      updatePosition(clamped);
      saveStoredPosition(storageKey, clamped);
    }
  }, [position, storageKey, updatePosition]);

  useEffect(() => {
    const stored = readStoredPosition(storageKey);
    if (!stored) return;
    updatePosition(stored);
    const frame = window.requestAnimationFrame(() => {
      const element = panelRef.current;
      if (!element) return;
      const clamped = clampPosition(element, stored);
      updatePosition(clamped);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey, updatePosition]);

  useEffect(() => {
    const onResize = () => reclamp();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reclamp]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const element = panelRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* browser fallback */ }
    setDragging(true);
    // Once dragging starts, switch from bottom/right CSS anchoring to an
    // explicit top-left coordinate based on the panel's current visual spot.
    updatePosition({ x: rect.left, y: rect.top });
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const element = panelRef.current;
    if (!drag || !element || drag.pointerId !== event.pointerId) return;
    const next = clampPosition(element, {
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    });
    updatePosition(next);
    event.preventDefault();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* browser fallback */ }
    const latest = positionRef.current;
    if (latest) commit(latest);
    event.preventDefault();
  };

  return {
    panelRef,
    floatingStyle: position
      ? {
          left: position.x,
          top: position.y,
          right: "auto",
          bottom: "auto",
        }
      : undefined,
    dragging,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      style: { touchAction: "none", cursor: dragging ? "grabbing" : "grab" },
    },
    reclamp,
  };
}
