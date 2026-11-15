import type { ButtonProps } from "../components.tsx";
const action = async (_details: { signal: AbortSignal }) => {};
const onError = (_error: unknown) => {};
const nativeSubmit: ButtonProps = {
  type: "submit",
  name: "intent",
  value: "save",
};
const nativeReset: ButtonProps = { type: "reset" };
const asyncButton: ButtonProps = { action, pendingLabel: "Saving…", onError };
// @ts-expect-error An async action cannot also submit a form.
const asyncSubmit: ButtonProps = {
  type: "submit",
  action,
  pendingLabel: "Saving…",
  onError,
};
// @ts-expect-error Action mode requires an explicit error owner.
const missingError: ButtonProps = { action, pendingLabel: "Saving…" };
// @ts-expect-error Pending presentation requires an explicit action.
const orphanPending: ButtonProps = { pendingLabel: "Saving…", onError };
// @ts-expect-error The pending label is required with an action.
const missingLabel: ButtonProps = { action, onError };
void [
  nativeSubmit,
  nativeReset,
  asyncButton,
  asyncSubmit,
  missingError,
  orphanPending,
  missingLabel,
];
