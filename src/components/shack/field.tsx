import type { ReactNode } from "react";

import { shackHintClass, shackLabelClass } from "@/components/shack/styles";

interface FieldProps {
  children: ReactNode;
  className?: string;
  hint?: string;
  htmlFor: string;
  label: string;
}

export function Field({ children, className, hint, htmlFor, label }: FieldProps) {
  return (
    <div
      className={
        className === undefined ? "flex flex-col gap-2" : `flex flex-col gap-2 ${className}`
      }
    >
      <label className={shackLabelClass} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : <p className={shackHintClass}>{hint}</p>}
    </div>
  );
}
