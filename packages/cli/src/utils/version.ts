declare const __CLI_VERSION__: string;

/**
 * Gets the current version, injected at build time by tsup.
 */
export function getVersion(): string {
  return typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "unknown";
}
