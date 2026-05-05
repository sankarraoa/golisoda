import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PortalOverflowMenuPlacement = "auto" | "above" | "below";

type Props = {
  open: boolean;
  anchorEl: HTMLElement | null;
  placement?: PortalOverflowMenuPlacement;
  onClose: () => void;
  children: ReactNode;
};

function positionMenuEl(
  menu: HTMLDivElement,
  anchorRect: DOMRect,
  placement: PortalOverflowMenuPlacement,
) {
  const gap = 4;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;

  let top = anchorRect.bottom + gap;
  let left = anchorRect.right - mw;

  if (left < 8) left = 8;
  if (left + mw > vw - 8) left = Math.max(8, vw - mw - 8);

  let useAbove =
    placement === "above" ||
    (placement === "auto" && top + mh > vh - 8 && anchorRect.top - gap - mh >= 8);
  if (placement === "below") useAbove = false;
  if (useAbove) {
    top = anchorRect.top - gap - mh;
  }

  top = Math.max(8, Math.min(top, vh - mh - 8));

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

export function PortalOverflowMenu({
  open,
  anchorEl,
  placement = "auto",
  onClose,
  children,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [layoutTick, setLayoutTick] = useState(0);

  useLayoutEffect(() => {
    if (!open || !anchorEl || !menuRef.current) return;
    positionMenuEl(menuRef.current, anchorEl.getBoundingClientRect(), placement);
    const frame = window.requestAnimationFrame(() => {
      if (anchorEl.isConnected && menuRef.current) {
        positionMenuEl(menuRef.current, anchorEl.getBoundingClientRect(), placement);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, anchorEl, placement, layoutTick]);

  useEffect(() => {
    if (!open || !anchorEl) return;
    const onResize = () => setLayoutTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorEl?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    const onScroll = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, anchorEl, onClose]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <div ref={menuRef} className="row-menu row-menu--portal" role="menu">
      {children}
    </div>,
    document.body,
  );
}
