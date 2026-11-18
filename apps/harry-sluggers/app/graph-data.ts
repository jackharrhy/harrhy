export interface GraphData {
  edges: {
    character1: string;
    character2: string;
    relationship: "positive" | "negative";
  }[];
  icons: Record<string, string>;
}
