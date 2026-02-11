import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';

function getErrorDetails(error: unknown): { status: number; title: string; message: string } {
  if (isRouteErrorResponse(error)) {
    const status = error.status;
    if (status === 404) {
      return {
        status,
        title: 'Package not found',
        message: "This package doesn't exist, was unpublished, or maybe it's still being trained.",
      };
    } else if (status === 403) {
      return {
        status,
        title: 'Access denied',
        message: "You don't have permission to view this. Some packages are private.",
      };
    }
    return {
      status,
      title: 'Server error',
      message: 'Our servers are having a moment. Please try again in a bit.',
    };
  }

  return {
    status: 500,
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Our AI is probably just as confused as you are.',
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n\n${error.stack ?? ''}`;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export default function ErrorPage() {
  const error = useRouteError();
  const { status, title, message } = getErrorDetails(error);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-md w-full text-center">
        {/* Lost in Transit Illustration */}
        <div className="mb-8">
          <svg
            className="w-48 h-48 mx-auto"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Floating clouds in background */}
            <ellipse cx="30" cy="60" rx="20" ry="10" fill="#e5e7eb" className="animate-pulse" />
            <ellipse cx="170" cy="80" rx="18" ry="8" fill="#e5e7eb" className="animate-pulse" />
            <ellipse cx="160" cy="150" rx="15" ry="7" fill="#e5e7eb" />

            {/* Package body */}
            <g className="animate-[bounce_3s_ease-in-out_infinite]">
              {/* Box */}
              <rect x="60" y="70" width="60" height="50" rx="4" fill="#16a34a" />
              <rect x="60" y="70" width="60" height="50" rx="4" stroke="#15803d" strokeWidth="2" />

              {/* Box tape/stripe */}
              <rect x="85" y="70" width="10" height="50" fill="#22c55e" />

              {/* Shipping label */}
              <rect x="65" y="85" width="15" height="10" rx="1" fill="white" />
              <line x1="67" y1="88" x2="78" y2="88" stroke="#d1d5db" strokeWidth="1" />
              <line x1="67" y1="91" x2="75" y2="91" stroke="#d1d5db" strokeWidth="1" />

              {/* Googly eyes */}
              <circle cx="75" cy="78" r="8" fill="white" />
              <circle cx="105" cy="78" r="8" fill="white" />
              <circle cx="77" cy="80" r="4" fill="#1f2937" className="animate-[look_4s_ease-in-out_infinite]" />
              <circle cx="107" cy="80" r="4" fill="#1f2937" className="animate-[look_4s_ease-in-out_infinite]" />
              {/* Eye shine */}
              <circle cx="78" cy="78" r="1.5" fill="white" />
              <circle cx="108" cy="78" r="1.5" fill="white" />

              {/* Worried eyebrows */}
              <path d="M68 68 L78 72" stroke="#15803d" strokeWidth="2" strokeLinecap="round" />
              <path d="M112 68 L102 72" stroke="#15803d" strokeWidth="2" strokeLinecap="round" />

              {/* Small worried mouth */}
              <path d="M85 108 Q90 104 95 108" stroke="#15803d" strokeWidth="2" strokeLinecap="round" fill="none" />

              {/* Stick legs */}
              <line x1="75" y1="120" x2="70" y2="145" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />
              <line x1="105" y1="120" x2="110" y2="145" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />

              {/* Little feet */}
              <ellipse cx="68" cy="148" rx="6" ry="3" fill="#1f2937" />
              <ellipse cx="112" cy="148" rx="6" ry="3" fill="#1f2937" />

              {/* Stick arms */}
              <line x1="60" y1="90" x2="40" y2="75" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />
              <line x1="120" y1="90" x2="140" y2="100" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />

              {/* Hand holding map (left) */}
              <circle cx="38" cy="73" r="4" fill="#1f2937" />

              {/* Map (held upside down) */}
              <g transform="rotate(15, 30, 55)">
                <rect x="15" y="45" width="30" height="22" rx="2" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" />
                {/* Map lines (upside down) */}
                <path d="M20 52 L25 58 L35 50" stroke="#f59e0b" strokeWidth="1" fill="none" />
                <circle cx="38" cy="60" r="2" fill="#ef4444" /> {/* "You are here" dot */}
                <path d="M22 62 L28 62" stroke="#d97706" strokeWidth="1" />
              </g>

              {/* Right hand */}
              <circle cx="142" cy="102" r="4" fill="#1f2937" />
            </g>

            {/* Question marks floating around */}
            <text x="150" y="50" className="text-lg fill-mpak-gray-400 animate-bounce" style={{ animationDelay: '0.5s' }}>?</text>
            <text x="45" y="160" className="text-sm fill-mpak-gray-400 animate-bounce" style={{ animationDelay: '1s' }}>?</text>
            <text x="165" y="130" className="text-base fill-mpak-gray-400 animate-bounce" style={{ animationDelay: '0.2s' }}>?</text>
          </svg>
        </div>

        {/* Error Code */}
        <div className="text-6xl font-bold text-mpak-gray-200 mb-2">
          {status}
        </div>

        {/* Error Title */}
        <h1 className="text-2xl font-bold text-mpak-gray-900 mb-3">
          {title}
        </h1>

        {/* Error Message */}
        <p className="text-mpak-gray-600 mb-8">
          {message}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="px-5 py-2.5 bg-accent-gold-400 text-mpak-dark font-semibold rounded-lg hover:bg-accent-gold-500 transition-colors"
          >
            Go Home
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-mpak-gray-100 text-mpak-gray-700 font-medium rounded-lg hover:bg-mpak-gray-200 transition-colors"
          >
            Try Again
          </button>
        </div>

        {/* Help text */}
        <p className="mt-8 text-sm text-mpak-gray-500">
          If this keeps happening,{' '}
          <Link to="/contact" className="text-accent-gold-400 hover:text-accent-gold-500">
            let us know
          </Link>
          .
        </p>

        {/* Dev error details (only in development) */}
        {import.meta.env.DEV && error != null ? (
          <details className="mt-8 text-left bg-mpak-gray-50 border border-mpak-gray-200 rounded-lg p-4">
            <summary className="text-sm font-medium text-mpak-gray-700 cursor-pointer">
              Error Details (dev only)
            </summary>
            <pre className="mt-2 text-xs text-mpak-gray-600 overflow-auto">
              {formatError(error)}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
