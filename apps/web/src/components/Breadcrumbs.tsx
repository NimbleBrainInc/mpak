import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { generateBreadcrumbSchema } from '../lib/schema';
import { SITE_URL } from '../lib/siteConfig';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

const BASE_URL = SITE_URL;

/**
 * Breadcrumb navigation component with JSON-LD structured data
 */
export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  // Inject breadcrumb schema
  useEffect(() => {
    const schemaItems = items.map((item) => ({
      name: item.label,
      url: item.href ? `${BASE_URL}${item.href}` : `${BASE_URL}${window.location.pathname}`,
    }));

    const schema = generateBreadcrumbSchema(schemaItems);

    // Remove existing breadcrumb schema
    const existing = document.querySelector('script[data-seo="breadcrumb"]');
    if (existing) {
      existing.remove();
    }

    // Add new schema
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'breadcrumb');
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      const el = document.querySelector('script[data-seo="breadcrumb"]');
      if (el) el.remove();
    };
  }, [items]);

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center gap-2 text-sm text-mpak-gray-500">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            {index > 0 && (
              <svg
                className="w-4 h-4 text-mpak-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
            {item.href && index < items.length - 1 ? (
              <Link
                to={item.href}
                className="hover:text-accent-gold-400 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  index === items.length - 1 ? 'text-mpak-gray-900 font-medium' : ''
                }
                aria-current={index === items.length - 1 ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
