import { Mpak } from '@nimblebrain/mpak-sdk';
import { getVersion } from './version.js';

const mpakHome = process.env['MPAK_HOME'];
const registryUrl = process.env['MPAK_REGISTRY_URL'];

export const mpak = new Mpak({
  ...(mpakHome ? { mpakHome } : {}),
  ...(registryUrl ? { registryUrl } : {}),
  userAgent: `mpak-cli/${getVersion()}`,
});
