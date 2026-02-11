import { useSEO } from '../hooks/useSEO';
import Breadcrumbs from '../components/Breadcrumbs';
import { siteConfig } from '../lib/siteConfig';

export default function TermsPage() {
  useSEO({
    title: 'Terms of Service - mpak',
    description: 'Terms of service for mpak, the secure package registry for MCP servers and agent skills.',
    canonical: 'https://www.mpak.dev/terms',
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Terms of Service' },
        ]}
      />

      <h1 className="text-4xl font-bold text-mpak-gray-900 mb-2">Terms of Service</h1>
      <p className="text-sm text-mpak-gray-500 mb-12">Last updated: February 9, 2026</p>

      <div className="space-y-10 text-mpak-gray-600">
        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Agreement</h2>
          <p>
            By using mpak.dev or the mpak CLI ("the Service"), you agree to these terms. The Service is operated by {siteConfig.operator.name} ("{siteConfig.operator.shortName}", "we", "us"). If you don't agree, don't use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Using mpak</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>You may browse and install packages without an account.</li>
            <li>Publishing packages requires an account and agreement to these terms.</li>
            <li>You must be at least 13 years old to use the Service.</li>
            <li>You are responsible for keeping your account credentials secure.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Publishing packages</h2>
          <p className="mb-3">When you publish a package to mpak, you represent that:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>You have the right to distribute the code and content.</li>
            <li>The package does not contain malware, backdoors, or intentionally malicious code.</li>
            <li>The package metadata (name, description, license) is accurate.</li>
            <li>You comply with the license terms of any third-party code included in your package.</li>
          </ul>
          <p className="mt-3">
            You retain ownership of packages you publish. By publishing, you grant {siteConfig.operator.shortName} a license to host, distribute, scan, and display your package through the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Acceptable use</h2>
          <p className="mb-3">You may not:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Publish packages containing malware or code designed to harm users.</li>
            <li>Squat on package names to prevent others from using them.</li>
            <li>Abuse the registry API (excessive requests, scraping, automated mass publishing).</li>
            <li>Impersonate other publishers or misrepresent package provenance.</li>
            <li>Use the Service to distribute content that violates applicable law.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Trust scores and security scans</h2>
          <p>
            mpak provides trust scores and security scan results as informational signals. They are not guarantees of safety. You are responsible for evaluating the packages you install. We scan packages in good faith but do not warrant that any package is free of vulnerabilities.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Package removal</h2>
          <p>
            We may remove packages that violate these terms, contain security vulnerabilities, or are subject to valid legal complaints. We will make reasonable efforts to notify publishers before removal, except in cases of active security threats.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Service availability</h2>
          <p>
            mpak is provided "as is." We aim for high availability but don't guarantee uninterrupted service. We may modify or discontinue features with reasonable notice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, {siteConfig.operator.shortName} is not liable for any indirect, incidental, or consequential damages arising from your use of the Service or any packages obtained through it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Changes to these terms</h2>
          <p>
            We may update these terms. Material changes will be posted on this page with an updated date. Continued use of the Service after changes constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-3">Contact</h2>
          <p>
            Questions about these terms? Email us at{' '}
            <a href={`mailto:${siteConfig.contact.legal}`} className="text-accent-gold-400 hover:text-accent-gold-300">
              {siteConfig.contact.legal}
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
