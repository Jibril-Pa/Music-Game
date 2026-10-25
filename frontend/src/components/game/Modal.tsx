"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * A book page over the game (pause, Chord Book, song picker). Moves focus in
 * on mount (initialFocus, else the first control), keeps Tab inside, and on
 * unmount hands focus back (returnFocus, else whatever opened it) on the next
 * frame, once the page behind is no longer inert. Esc is handled by GameApp,
 * which knows the layering (book over pause over picker).
 */
export default function Modal({
  labelledBy,
  initialFocus,
  returnFocus,
  inert,
  className,
  children,
}: {
  labelledBy: string;
  /** Selector of the control to focus first. */
  initialFocus?: string;
  returnFocus?: RefObject<HTMLElement | null>;
  /** Another modal is open on top of this one. */
  inert?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opts = useRef({ initialFocus, returnFocus });
  const opener = useRef<HTMLElement | null>(null);
  const restore = useRef(0);

  useEffect(() => {
    // Dev StrictMode runs this effect twice: keep the first opener, and cancel the
    // focus hand-back the simulated unmount scheduled.
    cancelAnimationFrame(restore.current);
    const root = ref.current;
    if (!opener.current && document.activeElement instanceof HTMLElement && !root?.contains(document.activeElement)) opener.current = document.activeElement;
    const { initialFocus: first, returnFocus: back } = opts.current;
    const target = (first ? root?.querySelector<HTMLElement>(first) : null) ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
    return () => {
      const to = back?.current ?? opener.current;
      restore.current = requestAnimationFrame(() => {
        if (to?.isConnected) to.focus({ preventScroll: true });
      });
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !ref.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !ref.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={ref}
      className={className ? `gm-modal ${className}` : "gm-modal"}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      inert={inert}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
