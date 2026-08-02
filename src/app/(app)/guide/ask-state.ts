export type AskState = {
  status: "idle" | "answered" | "not_in_guide" | "search" | "no_match";
  answer: string | null;
  sectionIds: string[];
  question: string;
};

export const ASK_IDLE: AskState = {
  status: "idle",
  answer: null,
  sectionIds: [],
  question: "",
};
