import { TailChairMascot } from "../tail-chair/react/TailChairMascot";
import { usePreferences } from "../preferences/preferences";
export function HeroMascot() {
  const { preferences } = usePreferences();
  return (
    <div
      className="ts-hero-art ts-chair-scene"
      role="group"
      aria-label="TAIL sitting in a chair with a laptop"
    >
      <TailChairMascot
        assetBaseUrl={`${import.meta.env.BASE_URL}tail-chair/assets/`}
        reducedMotion={preferences.reducedMotion ? true : "auto"}
      />
    </div>
  );
}
