import { SECURITY_HEADERS } from '../lib/meta';
import LoginPage from '../pages/LoginPage';

export function meta() {
  return [{ title: 'Sign in | mpak' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export default function LoginRoute() {
  return <LoginPage />;
}

export function headers() {
  return { ...SECURITY_HEADERS };
}
