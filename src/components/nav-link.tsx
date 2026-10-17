import Link from "next/link";

interface NavLinkProps {
  children: string;
  href: string;
  external?: boolean;
  onClick?: () => void;
}

export function NavLink({ children, href, external = false, onClick }: NavLinkProps) {
  const className =
    "group relative inline-flex items-center px-1 text-base uppercase tracking-wider text-signal transition-colors hover:text-ink";

  const content = (
    <>
      <Bracket side="left" />
      <span>{children}</span>
      <Bracket side="right" />
    </>
  );

  if (external) {
    return (
      <a
        className={className}
        href={href}
        rel="noreferrer"
        target="_blank"
        {...(onClick === undefined ? {} : { onClick })}
      >
        {content}
      </a>
    );
  }

  return (
    <Link className={className} href={href} {...(onClick === undefined ? {} : { onClick })}>
      {content}
    </Link>
  );
}

function Bracket({ side }: { side: "left" | "right" }) {
  const position =
    side === "left"
      ? "left-[-0.65rem] translate-x-2 group-hover:translate-x-0"
      : "right-[-0.65rem] -translate-x-2 group-hover:translate-x-0";

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 flex items-center text-signal-bright opacity-0 transition-all duration-200 group-hover:opacity-100 ${position}`}
    >
      {side === "left" ? "[" : "]"}
    </span>
  );
}
