import { render, screen } from '../test/test-utils';
import userEvent from '@testing-library/user-event';
import LostInTransit from './LostInTransit';

describe('LostInTransit', () => {
  it('renders default title and message', () => {
    render(<LostInTransit />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText("We couldn't find what you're looking for.")).toBeInTheDocument();
  });

  it('renders custom title and message', () => {
    render(<LostInTransit title="Not Found" message="Package missing" />);
    expect(screen.getByText('Not Found')).toBeInTheDocument();
    expect(screen.getByText('Package missing')).toBeInTheDocument();
  });

  it('shows home button by default', () => {
    render(<LostInTransit />);
    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  it('hides home button when showHomeButton=false', () => {
    render(<LostInTransit showHomeButton={false} />);
    expect(screen.queryByText('Go Home')).not.toBeInTheDocument();
  });

  it('renders back link when backLink and backLabel provided', () => {
    render(<LostInTransit backLink="/packages" backLabel="Back to Packages" />);
    const link = screen.getByText(/Back to Packages/);
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/packages');
  });

  it('does not render back link without both props', () => {
    render(<LostInTransit backLink="/packages" />);
    expect(screen.queryByText(/Back to/)).not.toBeInTheDocument();
  });

  it('renders retry button and calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<LostInTransit showRetryButton onRetry={onRetry} />);

    const button = screen.getByText('Try Again');
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not render retry button when showRetryButton=false', () => {
    render(<LostInTransit showRetryButton={false} onRetry={() => {}} />);
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
  });
});
