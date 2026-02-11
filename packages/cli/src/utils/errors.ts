/**
 * Custom error class for CLI errors
 */
export class CLIError extends Error {
  public readonly exitCode: number;

  constructor(message: string, exitCode: number = 1) {
    super(message);
    this.name = "CLIError";
    this.exitCode = exitCode;
  }
}

/**
 * Handles errors gracefully and exits with appropriate code
 */
export function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    console.error(`Error: ${error.message}`);
    process.exit(error.exitCode);
  }

  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  console.error("An unexpected error occurred");
  process.exit(1);
}
