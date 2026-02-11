import { render, screen, waitFor } from '../test/test-utils';
import userEvent from '@testing-library/user-event';
import BadgeSection from './BadgeSection';

describe('BadgeSection', () => {
  it('renders correct badge URL for bundle type', () => {
    render(<BadgeSection packageName="@scope/test-pkg" />);
    const img = screen.getByAltText('mpak badge');
    expect(img).toHaveAttribute('src', expect.stringContaining('/v1/bundles/@scope/test-pkg/badge.svg'));
  });

  it('renders correct badge URL for skill type', () => {
    render(<BadgeSection packageName="@scope/test-skill" packageType="skill" />);
    const img = screen.getByAltText('mpak badge');
    expect(img).toHaveAttribute('src', expect.stringContaining('/v1/skills/@scope/test-skill/badge.svg'));
  });

  it('copies markdown to clipboard on click', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<BadgeSection packageName="@scope/pkg" />);

    const copyButton = screen.getByText('Copy');
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('[![mpak]'));
  });

  it('shows "Copied!" state after click', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<BadgeSection packageName="@scope/pkg" />);

    await user.click(screen.getByText('Copy'));
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('renders HTML version in details/summary', () => {
    render(<BadgeSection packageName="@scope/pkg" />);
    const summary = screen.getByText('Show HTML version');
    expect(summary).toBeInTheDocument();
    expect(summary.tagName).toBe('SUMMARY');
  });
});
