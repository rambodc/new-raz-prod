import type { User } from "firebase/auth";
import type { FormEvent } from "react";
import { AccountAccessCard } from "./AccountAccessCard";
import type { AuthMode } from "./types-auth";
import type { ChatCardType } from "./types";

type Props = {
  type: ChatCardType;
  user: User | null;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onSignOut: () => void;
};

const cardRegistry = {
  "account-access": AccountAccessCard,
} satisfies Record<ChatCardType, typeof AccountAccessCard>;

export function ChatCardRenderer(props: Props) {
  const Card = cardRegistry[props.type];
  return <Card {...props} />;
}
