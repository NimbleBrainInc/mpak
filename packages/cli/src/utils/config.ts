import { MpakConfigManager } from "@nimblebrain/mpak-sdk";

const mpakHome = process.env["MPAK_HOME"];
const registryUrl = process.env["MPAK_REGISTRY_URL"];

export const mpakConfigManager = new MpakConfigManager({
	...(mpakHome ? { mpakHome } : {}),
	...(registryUrl ? { registryUrl } : {}),
});
