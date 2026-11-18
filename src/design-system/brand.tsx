import { ASSISTANT_NAME } from "../lib/assistantIdentity";
import { createContext, useContext, type ReactNode } from "react";
const Brand = createContext({ product: "PART", assistant: ASSISTANT_NAME });
export function TailBrand({ children }: { children: ReactNode }) {
  return (
    <Brand.Provider value={{ product: "TAIL", assistant: ASSISTANT_NAME }}>
      {children}
    </Brand.Provider>
  );
}
export const useProductBrand = () => useContext(Brand);
export function AssistantName() {
  return <>{useProductBrand().assistant}</>;
}
