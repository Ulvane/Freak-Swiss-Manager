"use client";

import { type ReactNode, useEffect, useState } from "react";

export const ACCORDION_DURATION = 550;

type Props = {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
};

// The parent owns mounting and exit timing; this component only animates the content.
export function SmoothAccordion({ isOpen, children, className = "" }: Props) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return (
    <div
      className={`smooth-accordion ${isOpen && entered ? "is-expanded" : ""} ${className}`}
      style={{ transitionDuration: `${ACCORDION_DURATION}ms` }}
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <div className="smooth-accordion-inner">{children}</div>
    </div>
  );
}
