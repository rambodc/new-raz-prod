import { createContext, useContext } from "react";

export type LabStyle = "aurora" | "cinematic";
export type LabRole = "fan" | "artist";

export const LAB_STYLES: readonly LabStyle[] = ["aurora", "cinematic"];
export const LAB_ROLES: readonly LabRole[] = ["fan", "artist"];
export const STYLE_KEY = "razzberry-lab-style";
export const ROLE_KEY = "razzberry-lab-role";

type LabContextValue = { style: LabStyle; setStyle: (s: LabStyle) => void; role: LabRole; setRole: (r: LabRole) => void };

export const LabContext = createContext<LabContextValue>({ style: "aurora", setStyle: () => {}, role: "fan", setRole: () => {} });

export function useLab() {
  return useContext(LabContext);
}
