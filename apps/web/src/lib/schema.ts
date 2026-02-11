import type { PackageDetail } from './api';
import { SITE_URL, siteConfig } from './siteConfig';

const BASE_URL = SITE_URL;

/**
 * Generate SoftwareApplication schema for a package
 */
export function generatePackageSchema(pkg: PackageDetail) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: pkg.display_name || pkg.name,
    description: pkg.description || `${pkg.name} MCP server bundle`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: getOperatingSystems(pkg),
    softwareVersion: pkg.latest_version,
    url: `${BASE_URL}/packages/${pkg.name}`,
    downloadUrl: `${BASE_URL}/packages/${pkg.name}`,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  // Add author if available
  if (pkg.author?.name) {
    schema.author = {
      '@type': 'Person',
      name: pkg.author.name,
    };
  }

  // Add aggregate rating based on GitHub stars
  if (pkg.github?.stars && pkg.github.stars > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: calculateRating(pkg.github.stars),
      bestRating: 5,
      ratingCount: pkg.github.stars,
    };
  }

  // Add license if available
  if (pkg.license) {
    schema.license = pkg.license;
  }

  return schema;
}

/**
 * Generate BreadcrumbList schema
 */
export function generateBreadcrumbSchema(
  items: Array<{ name: string; url: string }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Generate FAQPage schema
 */
export function generateFAQSchema(
  faqs: Array<{ question: string; answer: string }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Generate Organization schema
 */
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'mpak',
    url: BASE_URL,
    logo: `${BASE_URL}/favicon.svg`,
    description:
      'The package manager for MCP bundles. Discover, install, and publish Model Context Protocol servers.',
    sameAs: [
      siteConfig.github.repo,
      'https://twitter.com/mpak_dev',
    ],
  };
}

/**
 * Generate WebSite schema with SearchAction
 */
export function generateWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'mpak',
    url: BASE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE_URL}/?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Generate SoftwareSourceCode schema for the mpak CLI tool
 */
export function generateCLIToolSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'mpak CLI',
    alternateName: 'mpak',
    description:
      'Command-line interface for discovering, installing, and managing MCP server bundles.',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    downloadUrl: 'https://www.npmjs.com/package/@nimblebrain/mpak',
    softwareRequirements: 'Node.js 18+',
  };
}

/**
 * Generate ItemList schema for browse/listing pages
 */
export function generateItemListSchema(
  items: Array<{ name: string; url: string }>,
  listName: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

/**
 * Generate HowTo schema for step-by-step guides
 */
export function generateHowToSchema(
  name: string,
  description: string,
  steps: Array<{ name: string; text: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

// Helper functions

function getOperatingSystems(pkg: PackageDetail): string {
  const platforms = new Set<string>();

  pkg.versions?.forEach((version) => {
    version.artifacts?.forEach((artifact) => {
      if (artifact.os === 'darwin') platforms.add('macOS');
      else if (artifact.os === 'linux') platforms.add('Linux');
      else if (artifact.os === 'win32') platforms.add('Windows');
      else if (artifact.os === 'any') {
        platforms.add('macOS');
        platforms.add('Linux');
        platforms.add('Windows');
      }
    });
  });

  return platforms.size > 0 ? Array.from(platforms).join(', ') : 'Any';
}

function calculateRating(stars: number): number {
  // Convert GitHub stars to a 1-5 rating
  if (stars >= 1000) return 5;
  if (stars >= 100) return 4.5;
  if (stars >= 50) return 4;
  if (stars >= 10) return 3.5;
  return 3;
}
