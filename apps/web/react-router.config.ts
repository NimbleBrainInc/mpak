import type { Config } from '@react-router/dev/config';

export default {
  // Package and browse pages render on the server so crawlers get real HTML on
  // first byte. Before this, every route fell back to the SPA shell and the
  // package URLs served the prerendered homepage.
  ssr: true,
  appDirectory: 'src',
} satisfies Config;
