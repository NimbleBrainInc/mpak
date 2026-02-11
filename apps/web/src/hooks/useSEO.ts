import { useEffect } from 'react';
import { SITE_URL } from '../lib/siteConfig';

export interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogType?: 'website' | 'article' | 'product';
  keywords?: string[];
  noindex?: boolean;
  schema?: object | object[];
}

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
const SITE_NAME = 'mpak';
const DEFAULT_OG_IMAGE_ALT = 'mpak - The secure registry for MCP servers and skills';

/**
 * Custom SEO hook for React 19 that directly manipulates document.head
 * Updates meta tags, Open Graph, Twitter Cards, and JSON-LD structured data
 */
export function useSEO({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogImageAlt = DEFAULT_OG_IMAGE_ALT,
  ogType = 'website',
  keywords = [],
  noindex = false,
  schema,
}: SEOProps) {
  useEffect(() => {
    // Format title
    const fullTitle = title === SITE_NAME ? title : `${title} | ${SITE_NAME}`;

    // Update document title
    document.title = fullTitle;

    // Helper to update or create meta tag
    const setMeta = (selector: string, content: string) => {
      let element = document.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement('meta');
        const attrName = selector.includes('property=') ? 'property' : 'name';
        const attrValue = selector.match(/(?:name|property)="([^"]+)"/)?.[1];
        if (attrValue) {
          element.setAttribute(attrName, attrValue);
        }
        document.head.appendChild(element);
      }
      element.content = content;
    };

    // Helper to update or create link tag
    const setLink = (rel: string, href: string) => {
      let element = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (!element) {
        element = document.createElement('link');
        element.rel = rel;
        document.head.appendChild(element);
      }
      element.href = href;
    };

    // Primary meta tags
    setMeta('meta[name="description"]', description);
    setMeta('meta[name="robots"]', noindex ? 'noindex, nofollow' : 'index, follow');

    if (keywords.length > 0) {
      setMeta('meta[name="keywords"]', keywords.join(', '));
    }

    // Canonical URL
    if (canonical) {
      setLink('canonical', canonical);
    }

    // Open Graph tags
    setMeta('meta[property="og:title"]', fullTitle);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:type"]', ogType);
    setMeta('meta[property="og:image"]', ogImage);
    setMeta('meta[property="og:image:alt"]', ogImageAlt);
    if (canonical) {
      setMeta('meta[property="og:url"]', canonical);
    }

    // Twitter Card tags
    setMeta('meta[name="twitter:title"]', fullTitle);
    setMeta('meta[name="twitter:description"]', description);
    setMeta('meta[name="twitter:image"]', ogImage);
    setMeta('meta[name="twitter:image:alt"]', ogImageAlt);

    // JSON-LD Structured Data
    if (schema) {
      // Remove existing dynamic schema
      const existingSchema = document.querySelector('script[data-seo="dynamic"]');
      if (existingSchema) {
        existingSchema.remove();
      }

      const schemaScript = document.createElement('script');
      schemaScript.type = 'application/ld+json';
      schemaScript.setAttribute('data-seo', 'dynamic');

      // Support array of schemas or single schema
      const schemaData = Array.isArray(schema) ? schema : [schema];
      schemaScript.textContent = JSON.stringify(
        schemaData.length === 1 ? schemaData[0] : schemaData
      );
      document.head.appendChild(schemaScript);
    }

    // Cleanup function
    return () => {
      // Remove dynamic schema on unmount
      const dynamicSchema = document.querySelector('script[data-seo="dynamic"]');
      if (dynamicSchema) {
        dynamicSchema.remove();
      }
    };
  }, [title, description, canonical, ogImage, ogImageAlt, ogType, keywords, noindex, schema]);
}

export default useSEO;
