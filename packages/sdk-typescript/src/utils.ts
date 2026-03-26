import { MpakError } from "./errors.js";

/**
 * Parse a scoped package spec (`@scope/name` or `@scope/name@version`)
 * into its name and optional version components.
 *
 * @throws {MpakError} If the spec is not a valid scoped package name.
 *
 * @example
 * parsePackageSpec('@scope/name')        // { name: '@scope/name' }
 * parsePackageSpec('@scope/name@1.0.0')  // { name: '@scope/name', version: '1.0.0' }
 */
export function parsePackageSpec(spec: string): {
	name: string;
	version?: string;
} {
	const lastAtIndex = spec.lastIndexOf("@");

	let name: string;
	let version: string | undefined;

	if (lastAtIndex > 0) {
		name = spec.substring(0, lastAtIndex);
		version = spec.substring(lastAtIndex + 1);
	} else {
		name = spec;
	}

	if (!name.startsWith("@") || !name.includes("/")) {
		throw new MpakError(
			`Invalid package spec: "${spec}". Expected scoped format: @scope/name`,
			"INVALID_SPEC",
		);
	}

	return version ? { name, version } : { name };
}
