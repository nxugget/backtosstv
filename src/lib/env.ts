class MissingEnvironmentVariableError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "MissingEnvironmentVariableError";
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new MissingEnvironmentVariableError(name);
  }

  return value;
}

/**
 * For `NEXT_PUBLIC_` values read in client code. Next.js only inlines literal `process.env.X`
 * accesses, so the caller must read the variable itself and pass the result in.
 */
export function requirePublicEnv(value: string | undefined, name: string): string {
  if (value === undefined || value === "") {
    throw new MissingEnvironmentVariableError(name);
  }

  return value;
}
