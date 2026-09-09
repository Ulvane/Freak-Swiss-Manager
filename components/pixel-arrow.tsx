
type Props = {
  className?: string;
  direction?: "down" | "up";
};

export function PixelArrow({ className, direction = "down" }: Props) {
  return (
    <svg
      className={`pixel-arrow-icon ${direction === "up" ? "pixel-arrow-up" : ""} ${className ?? ""}`}
      viewBox="0 0 20 9"
      role="img"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        fill="currentColor"
        d="M0 0h4v1h-4zM16 0h4v1h-4zM1 1h4v1h-4zM15 1h4v1h-4zM2 2h4v1h-4zM14 2h4v1h-4zM3 3h4v1h-4zM13 3h4v1h-4zM4 4h4v1h-4zM12 4h4v1h-4zM5 5h4v1h-4zM11 5h4v1h-4zM6 6h8v1h-8zM7 7h6v1h-6zM8 8h4v1h-4z"
      />
    </svg>
  );
}
