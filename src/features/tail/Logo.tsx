import { mascotPoster } from "../../mascot/events";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { usePreferences } from "../preferences/preferences";
export function TailLogo({ onClick }: { onClick: () => void }) {
  const gradient = `tail-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { preferences } = usePreferences();
  const track = useRef<SVGPathElement>(null),
    star = useRef<SVGGElement>(null),
    flight = useRef<Animation | null>(null);
  const hovered = useRef(false),
    focused = useRef(false),
    reduced = useRef(false);
  const syncFlight = () => {
    const animation = flight.current;
    if (!animation) return;
    if (reduced.current) {
      animation.pause();
      animation.currentTime = 0;
      return;
    }
    const forward = hovered.current || focused.current,
      time = Number(animation.currentTime ?? 0);
    if ((forward && time >= 1000) || (!forward && time <= 0)) return;
    animation.playbackRate = forward ? 1 : -1;
    animation.play();
  };
  useEffect(() => {
    const path = track.current!,
      origin = path.getPointAtLength(0),
      length = path.getTotalLength();
    const frames = Array.from({ length: 65 }, (_, i) => {
      const point = path.getPointAtLength((length * 0.26 * i) / 64);
      return {
        transform: `translate(${point.x - origin.x}px, ${point.y - origin.y}px)`,
      };
    });
    const animation = star.current!.animate(frames, {
      duration: 1000,
      easing: "cubic-bezier(.4,0,.2,1)",
      fill: "both",
    });
    animation.pause();
    animation.currentTime = 0;
    flight.current = animation;
    const media = matchMedia("(prefers-reduced-motion: reduce)"),
      update = () => {
        reduced.current = preferences.reducedMotion || media.matches;
        syncFlight();
      };
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      animation.cancel();
      flight.current = null;
    };
  }, [preferences.reducedMotion]);
  return (
    <button
      className="tail-logo"
      style={{ "--tail-logo-gradient": `url(#${gradient})` } as CSSProperties}
      onClick={onClick}
      onPointerEnter={() => {
        hovered.current = true;
        syncFlight();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        syncFlight();
      }}
      onFocus={() => {
        focused.current = true;
        syncFlight();
      }}
      onBlur={() => {
        focused.current = false;
        syncFlight();
      }}
      aria-label="TAIL terminal"
    >
      <svg className="tail-orbit" viewBox="0 0 210 82" aria-hidden="true">
        <defs>
          <linearGradient id={gradient}>
            <stop stopColor="#9d4b22" />
            <stop offset=".36" stopColor="#ff963b" />
            <stop offset="1" stopColor="#ff812e" />
          </linearGradient>
        </defs>
        <path className="logo-orbit-back" d="M29 34C57 9 157 9 184 20" />
        <path
          className="logo-orbit-front"
          d="M28 34C-7 54 13 72 75 74C134 76 197 54 198 33C199 25 194 21 184 20"
        />
        <path
          ref={track}
          d="M184 20C194 21 199 25 198 33C197 54 134 76 75 74C13 72-7 54 28 34C57 9 157 9 184 20"
          fill="none"
          stroke="none"
        />
        <g ref={star} className="logo-star-flight">
          <path
            className="logo-star"
            d="m186 11 2.7 6.3 6.3 2.7-6.3 2.7-2.7 6.3-2.7-6.3L177 20l6.3-2.7Z"
          />
        </g>
      </svg>
      <img
        src={mascotPoster()}
        alt=""
        className="tail-mascot logo-character"
        width="84"
        height="84"
        style={{ height: "auto" }}
      />
      <svg
        className="tail-wordmark"
        viewBox="0 0 132 40"
        role="img"
        aria-label="TAIL"
      >
        <path
          fillRule="evenodd"
          d="M9 4h38l-2.3 8.2H32.8L26.2 36H14.4L21 12.2H6.7ZM57 4h13.4L74 36H62.5l-.3-6.8H50.5L46.6 36H34.8Zm-2 18h7l-.4-11ZM87 4h11.7L89.8 36H78.1Zm23 0h11.7l-6.6 23.6H132l-2.4 8.4h-28.6Z"
        />
      </svg>
    </button>
  );
}
