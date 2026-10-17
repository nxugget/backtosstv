import { shackAlertClass, shackNoticeClass } from "@/components/shack/styles";

interface FormMessageProps {
  className?: string;
  message: string | null;
  status: "idle" | "success" | "error";
}

/**
 * Stays in the tree even when there is nothing to say. Adding and removing it would shift its
 * siblings, and React remounts a shifted child, which throws away whatever was typed in the form
 * next to it.
 */
export function FormMessage({ className, message, status }: FormMessageProps) {
  const stateClass =
    message === null ? "hidden" : status === "error" ? shackAlertClass : shackNoticeClass;

  return (
    <p
      role="status"
      className={className === undefined ? stateClass : `${stateClass} ${className}`}
    >
      {message}
    </p>
  );
}
