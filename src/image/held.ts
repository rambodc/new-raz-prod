export type HeldImage = {
  id: string;
  url: string;
  mime: string;
  kind: "original" | "ai-edited" | "ai-generated" | "cutout";
  sourceId: string | null;
  prompt: string;
  label: string;
};
