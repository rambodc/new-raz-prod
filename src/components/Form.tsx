import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "./Icons";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
};

export function Field({ label, error, hint, trailing, className, ...input }: FieldProps) {
  const id = useId();
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field${error ? " has-error" : ""}${trailing ? " has-trailing" : ""}${className ? ` ${className}` : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="control">
        <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
        {trailing}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ label, ...props }: Omit<FieldProps, "type" | "trailing">) {
  const [shown, setShown] = useState(false);
  return (
    <Field
      {...props}
      label={label}
      type={shown ? "text" : "password"}
      autoCapitalize="none"
      spellCheck={false}
      trailing={
        <button type="button" className="reveal-btn" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      }
    />
  );
}

export function FormAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
