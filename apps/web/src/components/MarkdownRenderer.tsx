import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Accent = 'gold' | 'purple';

const accentClasses: Record<Accent, { link: string }> = {
  gold: {
    link: 'text-accent-gold-400 hover:text-accent-gold-500',
  },
  purple: {
    link: 'text-accent-purple-400 hover:text-accent-purple-500',
  },
};

function buildComponents(accent: Accent): Components {
  const { link } = accentClasses[accent];

  return {
    h1: ({ children }) => (
      <h1 className="text-xl font-bold text-mpak-gray-900 mt-6 mb-4 first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-lg font-semibold text-mpak-gray-900 mt-6 mb-3">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-base font-semibold text-mpak-gray-900 mt-4 mb-2">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="text-mpak-gray-600 mb-4 leading-relaxed">{children}</p>
    ),
    a: ({ href, children }) => (
      <a href={href} className={`${link} underline`} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside mb-4 text-mpak-gray-600 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-4 text-mpak-gray-600 space-y-1">{children}</ol>
    ),
    img: ({ src, alt }) => (
      <img src={src} alt={alt || ''} className="inline-block h-6 mr-1" />
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="border-b border-white/[0.12]">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-white/[0.06]">{children}</tbody>
    ),
    tr: ({ children }) => <tr>{children}</tr>,
    th: ({ children }) => (
      <th className="px-3 py-2 text-left text-xs font-semibold text-mpak-gray-400 uppercase tracking-wide">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 text-mpak-gray-600">{children}</td>
    ),
    pre: ({ children }) => (
      <pre className="bg-surface-raised border border-white/[0.08] rounded-lg p-4 mb-4 overflow-x-auto text-sm font-mono [&>code]:bg-transparent [&>code]:p-0 [&>code]:border-0 [&>code]:rounded-none [&>code]:text-mpak-gray-800">
        {children}
      </pre>
    ),
    code: ({ children }) => (
      <code className="bg-surface-overlay border border-white/[0.06] text-mpak-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ),
  };
}

interface MarkdownRendererProps {
  children: string;
  accent?: Accent;
  className?: string;
}

export function MarkdownRenderer({ children, accent = 'gold', className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={buildComponents(accent)}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
