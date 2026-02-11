import { render, screen } from '../test/test-utils';
import RuntimeIcon from './RuntimeIcon';

describe('RuntimeIcon', () => {
  it('renders Node.js SVG for "node"', () => {
    render(<RuntimeIcon runtime="node" />);
    expect(screen.getByRole('img', { name: 'Node.js' })).toBeInTheDocument();
  });

  it('renders Node.js SVG for "nodejs"', () => {
    render(<RuntimeIcon runtime="nodejs" />);
    expect(screen.getByRole('img', { name: 'Node.js' })).toBeInTheDocument();
  });

  it('renders Python SVG for "python"', () => {
    render(<RuntimeIcon runtime="python" />);
    expect(screen.getByRole('img', { name: 'Python' })).toBeInTheDocument();
  });

  it('renders default icon for unknown runtime', () => {
    render(<RuntimeIcon runtime="binary" />);
    expect(screen.getByRole('img', { name: 'binary' })).toBeInTheDocument();
  });

  it('is case insensitive', () => {
    render(<RuntimeIcon runtime="PYTHON" />);
    expect(screen.getByRole('img', { name: 'Python' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<RuntimeIcon runtime="node" className="w-8 h-8" />);
    const svg = screen.getByRole('img', { name: 'Node.js' });
    expect(svg).toHaveClass('w-8', 'h-8');
  });
});
