import { redirect } from 'react-router';

// /bundles predates the registry moving to its own host, where browsing is the
// root. Kept as a redirect because it is linked from the marketing site, the
// docs, and the CLI's output.
export function loader() {
  return redirect('/', 301);
}
