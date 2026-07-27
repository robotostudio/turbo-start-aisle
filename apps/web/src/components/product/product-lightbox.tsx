"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ShopifyImage } from "@/lib/shopify/types";

type ProductLightboxProps = {
  images: ShopifyImage[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  /** Source rect captured when the lightbox was opened (for the open FLIP). */
  sourceRect: DOMRect | null;
  /** Resolves the current on-page source rect (for the close FLIP). */
  getSourceRect: (index: number) => DOMRect | null;
  /**
   * Resolves the optimized URL the on-page `next/image` already downloaded, so
   * the fullscreen `<img>` reuses that cached resource (instant, no new fetch).
   * `null` when the image isn't loaded on-page.
   */
  getSourceSrc: (index: number) => string | null;
};

/** In-lightbox zoom factor (click to magnify). */
const SCALE = 3;
const DRAG_THRESHOLD = 6;
/** Open/close FLIP timing. */
const FLIP_MS = 340;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const roundControl =
  "absolute z-10 flex size-11 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background";

/** Transform that maps the fullscreen image box onto the on-page source rect. */
function flipTransform(src: DOMRect, dst: DOMRect) {
  return `translate(${src.left - dst.left}px, ${src.top - dst.top}px) scale(${src.width / dst.width}, ${src.height / dst.height})`;
}

export function ProductLightbox({
  images,
  index,
  open,
  onOpenChange,
  onIndexChange,
  sourceRect,
  getSourceRect,
  getSourceSrc,
}: ProductLightboxProps) {
  const [zoomed, setZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [active, setActive] = useState(false); // backdrop + controls visible

  const imgRef = useRef<HTMLImageElement>(null);
  const fit = useRef({ w: 0, h: 0 });
  const drag = useRef({
    active: false,
    sx: 0,
    sy: 0,
    px: 0,
    py: 0,
    moved: false,
  });
  const closing = useRef(false);
  const openedFlip = useRef(false);

  const current = images[index];

  // Reuse the exact optimized URL the on-page gallery already downloaded so the
  // fullscreen image is an instant cache hit with no new fetch. Falls back to
  // the raw Shopify URL only when the image isn't loaded on-page (e.g. an
  // arrow-navigated image that was still lazy).
  const displaySrc = current ? (getSourceSrc(index) ?? current.url) : undefined;

  // Zoom the image out of its on-page source. Runs once the lightbox image has
  // laid out — usually frame 1, since `displaySrc` reuses the gallery's cached
  // resource; the raw-URL fallback can still lag, hence the polling below.
  const runOpenFlip = () => {
    if (!open || openedFlip.current) return;
    const img = imgRef.current;
    const src = sourceRect;
    if (!img || !src) return;
    const dst = img.getBoundingClientRect();
    if (dst.width < 1 || dst.height < 1) return;
    openedFlip.current = true;
    img.animate(
      [
        { transformOrigin: "top left", transform: flipTransform(src, dst) },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: FLIP_MS, easing: EASE }
    );
  };

  // Arm the open animation and fade the backdrop in. Poll for a few frames
  // because a remote <img> reports its size a little after mount (before it is
  // fully `complete`), and the FLIP needs a measurable box.
  // biome-ignore lint/correctness/useExhaustiveDependencies: arm on open only
  useLayoutEffect(() => {
    if (!open) {
      setActive(false);
      openedFlip.current = false;
      return;
    }
    closing.current = false;
    openedFlip.current = false;

    const fadeRaf = requestAnimationFrame(() => setActive(true));
    const deadline = performance.now() + 1000;
    let pollRaf = 0;
    const poll = () => {
      runOpenFlip();
      if (!openedFlip.current && performance.now() < deadline) {
        pollRaf = requestAnimationFrame(poll);
      }
    };
    pollRaf = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(fadeRaf);
      cancelAnimationFrame(pollRaf);
    };
  }, [open]);

  const resetZoom = () => {
    setZoomed(false);
    setPan({ x: 0, y: 0 });
    setPanning(false);
  };

  // Close: zoom the image back into the current source, then actually close.
  const requestClose = () => {
    if (closing.current) return;
    closing.current = true;
    setActive(false);

    const img = imgRef.current;
    const src = getSourceRect(index);
    const finish = () => onOpenChange(false);

    if (img && src) {
      // Measure the fitted (untransformed) rect even if currently zoomed.
      const prev = img.style.transform;
      img.style.transform = "none";
      const dst = img.getBoundingClientRect();
      img.style.transform = prev;

      resetZoom();
      if (dst.width > 0) {
        const anim = img.animate(
          [
            { transformOrigin: "top left", transform: "none" },
            { transformOrigin: "top left", transform: flipTransform(src, dst) },
          ],
          { duration: FLIP_MS, easing: EASE, fill: "forwards" }
        );
        anim.onfinish = finish;
        anim.oncancel = finish;
        return;
      }
    }
    resetZoom();
    window.setTimeout(finish, FLIP_MS);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    requestClose(); // ESC / interact-outside → animate, then close
  };

  const go = (dir: -1 | 1) => {
    resetZoom();
    onIndexChange((index + dir + images.length) % images.length);
  };

  const clampPan = (x: number, y: number) => {
    const maxX = (fit.current.w / 2) * (SCALE - 1);
    const maxY = (fit.current.h / 2) * (SCALE - 1);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    drag.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      px: pan.x,
      py: pan.y,
      moved: false,
    };
    if (zoomed) {
      setPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) drag.current.moved = true;
    if (zoomed) setPan(clampPan(drag.current.px + dx, drag.current.py + dy));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const wasDrag = drag.current.moved;
    drag.current.active = false;
    setPanning(false);
    if (wasDrag) return;

    if (zoomed) {
      resetZoom();
      return;
    }
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) {
      setZoomed(true);
      return;
    }
    fit.current = { w: rect.width, h: rect.height };
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    setPan(clampPan(dx * (1 - SCALE), dy * (1 - SCALE)));
    setZoomed(true);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (images.length < 2) return;
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className="gap-0 bg-transparent duration-0"
        onKeyDown={onKeyDown}
        overlayClassName="bg-transparent"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Product image viewer</DialogTitle>

        {/* Backdrop — fades in/out independently of the zooming image */}
        <button
          aria-label="Close"
          className={cn(
            "absolute inset-0 bg-background transition-opacity",
            active ? "opacity-100" : "opacity-0"
          )}
          onClick={requestClose}
          style={{ transitionDuration: `${FLIP_MS}ms` }}
          type="button"
        />

        {/* Zoomable image — click to magnify ~3x at the point, drag to pan */}
        <div className="pointer-events-none relative flex flex-1 items-center justify-center overflow-hidden p-4 md:p-8">
          {current && (
            <button
              aria-label={zoomed ? "Zoom out" : "Zoom in"}
              className={cn(
                "pointer-events-auto block touch-none",
                zoomed
                  ? panning
                    ? "cursor-grabbing"
                    : "cursor-grab"
                  : "cursor-zoom-in"
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              type="button"
            >
              {/* biome-ignore lint/performance/noImgElement: interactive zoom target, not a layout image */}
              <img
                alt={current.altText ?? "Product image"}
                className="block max-h-[calc(100vh-4rem)] w-auto max-w-[92vw] select-none object-contain"
                draggable={false}
                ref={imgRef}
                src={displaySrc}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomed ? SCALE : 1})`,
                  transformOrigin: "center center",
                  transition: panning ? "none" : "transform 200ms ease",
                }}
              />
            </button>
          )}
        </div>

        {/* Controls — fade with the backdrop */}
        <div
          className={cn(
            "transition-opacity",
            active ? "opacity-100" : "opacity-0"
          )}
          style={{ transitionDuration: `${FLIP_MS}ms` }}
        >
          <button
            aria-label="Close"
            className={cn(roundControl, "top-4 right-4")}
            onClick={requestClose}
            type="button"
          >
            <X className="size-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                aria-label="Previous image"
                className={cn(roundControl, "top-1/2 left-4 -translate-y-1/2")}
                onClick={() => go(-1)}
                type="button"
              >
                <ArrowLeft className="size-5" />
              </button>
              <button
                aria-label="Next image"
                className={cn(roundControl, "top-1/2 right-4 -translate-y-1/2")}
                onClick={() => go(1)}
                type="button"
              >
                <ArrowRight className="size-5" />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
