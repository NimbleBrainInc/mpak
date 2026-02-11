import { render, screen } from '../test/test-utils';
import Breadcrumbs from './Breadcrumbs';

describe('Breadcrumbs', () => {
  const items = [
    { label: 'Home', href: '/' },
    { label: 'Packages', href: '/packages' },
    { label: 'Test Package' },
  ];

  it('renders all labels', () => {
    render(<Breadcrumbs items={items} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Packages')).toBeInTheDocument();
    expect(screen.getByText('Test Package')).toBeInTheDocument();
  });

  it('renders non-last items with href as links', () => {
    render(<Breadcrumbs items={items} />);
    const homeLink = screen.getByText('Home');
    expect(homeLink.tagName).toBe('A');
    expect(homeLink).toHaveAttribute('href', '/');

    const packagesLink = screen.getByText('Packages');
    expect(packagesLink.tagName).toBe('A');
    expect(packagesLink).toHaveAttribute('href', '/packages');
  });

  it('renders last item with aria-current="page"', () => {
    render(<Breadcrumbs items={items} />);
    const lastItem = screen.getByText('Test Package');
    expect(lastItem).toHaveAttribute('aria-current', 'page');
  });

  it('renders last item as span (not link)', () => {
    render(<Breadcrumbs items={items} />);
    const lastItem = screen.getByText('Test Package');
    expect(lastItem.tagName).toBe('SPAN');
  });

  it('renders chevron separators between items (not before first)', () => {
    render(<Breadcrumbs items={items} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const svgs = nav.querySelectorAll('svg');
    // 2 chevrons for 3 items (between 1-2 and 2-3)
    expect(svgs).toHaveLength(2);
  });

  it('injects JSON-LD script into document.head', () => {
    render(<Breadcrumbs items={items} />);
    const script = document.querySelector('script[data-seo="breadcrumb"]');
    expect(script).not.toBeNull();
    expect(script!.getAttribute('type')).toBe('application/ld+json');

    const data = JSON.parse(script!.textContent || '');
    expect(data['@type']).toBe('BreadcrumbList');
    expect(data.itemListElement).toHaveLength(3);
  });

  it('cleans up JSON-LD script on unmount', () => {
    const { unmount } = render(<Breadcrumbs items={items} />);
    expect(document.querySelector('script[data-seo="breadcrumb"]')).not.toBeNull();

    unmount();
    expect(document.querySelector('script[data-seo="breadcrumb"]')).toBeNull();
  });
});
