import "./social.css";

const links = [
  {
    name: "Telegram",
    icon: (
      <path d="m21 4-3.5 16-5.2-4-2.8 2.7.5-5.2 8-7-10 6.1-4.8-1.7L21 4Z" />
    ),
  },
  {
    name: "Pump.fun",
    icon: (
      <g transform="rotate(-42 12 12)">
        <rect x="3" y="7" width="18" height="10" rx="5" />
        <path
          d="M12 7v10m0-10h4a5 5 0 0 1 0 10h-4Z"
          fill="currentColor"
          fillOpacity=".25"
        />
      </g>
    ),
  },
  { name: "X / Twitter", icon: <path d="M4 3h4l12 18h-4L4 3Zm15 0L5 21" /> },
];

/** Requested placeholders: no invented accounts, token addresses or outbound URLs. */
export function SocialLinks() {
  return (
    <div className="tail-social-links" role="group" aria-label="TAIL community">
      {links.map(({ name, icon }) => (
        <span key={name} title={`${name} · coming soon`}>
          <button type="button" disabled aria-label={`${name} · coming soon`}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {icon}
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
}
