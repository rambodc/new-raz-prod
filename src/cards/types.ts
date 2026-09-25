export type ChatCardType = "account-access";

export type ChatCardMessage = {
  role: "user" | "assistant";
  content: string;
  card?: ChatCardType;
};
