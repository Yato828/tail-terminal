import { forwardRef } from "react";
import { usePreferences } from "../features/preferences/preferences";
import {
  TailMascot as SuppliedMascot,
  type TailMascotHandle,
  type TailMascotProps,
} from "./react/TailMascot";
import { mascot, mascotAssetBase } from "./events";
import "./mascot.css";

export type { TailMascotHandle } from "./react/TailMascot";
export const TailMascot = forwardRef<TailMascotHandle, TailMascotProps>(
  function TailMascot({ className = "", reducedMotion, state, ...props }, ref) {
    const { preferences } = usePreferences();
    return (
      <SuppliedMascot
        {...props}
        ref={ref}
        state={state}
        assetBase={mascotAssetBase()}
        className={`tail-mascot ${className}`}
        reducedMotion={
          reducedMotion || preferences.reducedMotion ? true : undefined
        }
        connect={state ? undefined : mascot.connect}
      />
    );
  },
);
