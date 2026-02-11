import { useSEO } from '../hooks/useSEO';
import Breadcrumbs from '../components/Breadcrumbs';
import { siteConfig } from '../lib/siteConfig';

export default function PrivacyPage() {
  useSEO({
    title: 'Privacy Policy - mpak',
    description: 'Privacy policy for mpak, the secure package registry for MCP servers and agent skills.',
    canonical: 'https://www.mpak.dev/privacy',
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Privacy Policy' },
        ]}
      />

      <h1 className="text-4xl font-bold text-mpak-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-mpak-gray-500 mb-12">Last updated: February 9, 2026</p>

      <div className="space-y-10 text-mpak-gray-600">
        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Who we are</h2>
          <p>
            mpak is operated by {siteConfig.operator.name} ("{siteConfig.operator.shortName}", "we", "us"). This policy covers the mpak.dev website and the mpak CLI tool.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">What we collect</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-mpak-gray-800">Account information:</strong> When you create an account, we collect your email address and display name via our authentication provider (Clerk).</li>
            <li><strong className="text-mpak-gray-800">Package data:</strong> When you publish a package, we store the package contents, metadata, and your publisher identity.</li>
            <li><strong className="text-mpak-gray-800">Usage data:</strong> We collect aggregate download counts per package. The CLI does not send telemetry or track individual users.</li>
            <li><strong className="text-mpak-gray-800">Server logs:</strong> Our servers log IP addresses and request metadata for security and abuse prevention. Logs are retained for 30 days.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">What we don't collect</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>We don't use tracking cookies or third-party analytics.</li>
            <li>We don't sell or share personal data with third parties.</li>
            <li>We don't track which packages you install.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">How we use your data</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>To operate the registry and serve packages.</li>
            <li>To display publisher identity on packages you publish.</li>
            <li>To prevent abuse and enforce our terms of service.</li>
            <li>To send transactional emails about your account (no marketing emails).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Third-party services</h2>
          <p>We use the following services to operate mpak:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong className="text-mpak-gray-800">Clerk</strong> for authentication.</li>
            <li><strong className="text-mpak-gray-800">AWS</strong> for hosting and package storage.</li>
          </ul>
          <p className="mt-2">Each service has its own privacy policy governing its handling of your data.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Data deletion</h2>
          <p>
            You can delete your account at any time by contacting us. We will remove your account data and unpublish any packages you've published, unless they have downstream dependents.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Contact</h2>
          <p>
            Questions about this policy? Email us at{' '}
            <a href={`mailto:${siteConfig.contact.privacy}`} className="text-accent-gold-400 hover:text-accent-gold-300">
              {siteConfig.contact.privacy}
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
