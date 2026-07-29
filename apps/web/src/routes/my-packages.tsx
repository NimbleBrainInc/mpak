import UserPackagesPage from '../pages/UserPackagesPage';

export function meta() {
  return [{ title: 'My packages | mpak' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export default function MyPackagesRoute() {
  return <UserPackagesPage />;
}
