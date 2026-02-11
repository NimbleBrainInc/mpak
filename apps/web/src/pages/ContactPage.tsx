import { useSEO } from '../hooks/useSEO';
import { generateBreadcrumbSchema } from '../lib/schema';
import Breadcrumbs from '../components/Breadcrumbs';
import { siteConfig } from '../lib/siteConfig';

export default function ContactPage() {
  useSEO({
    title: 'Contact',
    description:
      'Get in touch with the mpak team. Contact us for support, partnerships, or feedback about the MCP package manager.',
    canonical: 'https://www.mpak.dev/contact',
    keywords: ['contact mpak', 'mpak support', 'mcp help'],
    schema: generateBreadcrumbSchema([
      { name: 'Home', url: 'https://www.mpak.dev/' },
      { name: 'Contact', url: 'https://www.mpak.dev/contact' },
    ]),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Contact' },
        ]}
      />

      <h1 className="text-4xl font-bold text-mpak-gray-900 mb-4">Contact</h1>
      <p className="text-mpak-gray-600 mb-12">
        Have questions, feedback, or need help? Here's how to reach us.
      </p>

      <div className="space-y-8">
        {/* Email */}
        <div className="bg-surface-raised border border-white/[0.08] rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-accent-gold-400/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-accent-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-mpak-gray-900 mb-1">Email</h2>
              <p className="text-mpak-gray-600 text-sm mb-3">
                For general inquiries, partnerships, or support.
              </p>
              <a
                href={`mailto:${siteConfig.contact.general}`}
                className="text-accent-gold-400 hover:text-accent-gold-500 font-medium"
              >
                {siteConfig.contact.general}
              </a>
            </div>
          </div>
        </div>

        {/* GitHub Issues */}
        <div className="bg-surface-raised border border-white/[0.08] rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-mpak-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-mpak-gray-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-mpak-gray-900 mb-1">GitHub Issues</h2>
              <p className="text-mpak-gray-600 text-sm mb-3">
                For bug reports, feature requests, or technical discussions.
              </p>
              <a
                href={siteConfig.github.issues}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-gold-400 hover:text-accent-gold-500 font-medium inline-flex items-center gap-1"
              >
                Open an issue
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
