export const BRAND_STAR_PATH =
  "M32 1C36 18 46 27 63 32C46 36 37 46 32 63C28 46 18 37 1 32C18 28 27 18 32 1Z";
export function BrandStar({
  className = "",
  outline = false,
}: {
  className?: string;
  outline?: boolean;
}) {
  return (
    <svg
      className={`brand-star ${className}`}
      width="1em"
      height="1em"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={BRAND_STAR_PATH}
        fill={outline ? "none" : "currentColor"}
        stroke={outline ? "currentColor" : "none"}
        strokeWidth="1.8"
      />
    </svg>
  );
}
