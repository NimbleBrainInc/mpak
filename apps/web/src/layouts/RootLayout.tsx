import { useState } from "react";
import { UserButton } from "@clerk/clerk-react";
import { Link, Outlet, ScrollRestoration } from "react-router-dom";
import { MpakWordmark } from "../components/MpakLogo";
import { DebugAuth } from "../components/DebugAuth";
import { AuthGuard, GuestGuard, authEnabled } from "../auth/AuthProvider";
import { siteConfig } from "../lib/siteConfig";

interface RootLayoutProps {
  children?: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = (
    <>
      <Link
        to="/bundles"
        className="text-sm font-medium text-mpak-gray-600 hover:text-accent-gold-400 transition-colors"
        onClick={() => setMobileMenuOpen(false)}
      >
        Bundles
      </Link>
      <Link
        to="/skills"
        className="text-sm font-medium text-mpak-gray-600 hover:text-accent-purple-400 transition-colors"
        onClick={() => setMobileMenuOpen(false)}
      >
        Skills
      </Link>
      <Link
        to="/publish"
        className="text-sm font-medium text-mpak-gray-600 hover:text-accent-gold-400 transition-colors"
        onClick={() => setMobileMenuOpen(false)}
      >
        Publish
      </Link>
      <a
        href={siteConfig.docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-mpak-gray-600 hover:text-mpak-gray-800 transition-colors"
      >
        Docs
      </a>
      <a
        href={siteConfig.github.repo}
        target="_blank"
        rel="noopener noreferrer"
        className="text-mpak-gray-500 hover:text-mpak-gray-800 transition-colors"
        aria-label="GitHub"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      </a>
    </>
  );

  return (
    <div className="min-h-screen bg-surface-base flex flex-col">
      {/* Scroll restoration - the proper way */}
      <ScrollRestoration />

      {/* Skip to content - keyboard accessibility */}
      <a href="#main" className="skip-to-content">
        Skip to main content
      </a>

      {/* Header */}
      <header role="banner" className="sticky top-0 z-50 bg-[#0c0a0f]/85 backdrop-blur-md border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center flex-shrink-0">
              <MpakWordmark />
            </Link>

            {/* Desktop Nav */}
            <nav aria-label="Main navigation" className="hidden md:flex items-center space-x-4">
              {navLinks}
              <div className="w-px h-5 bg-white/[0.08]" aria-hidden="true" />
              <AuthGuard>
                {authEnabled && (
                  <UserButton
                    afterSignOutUrl="/"
                    appearance={{
                      elements: {
                        avatarBox: "w-9 h-9",
                      },
                    }}
                  >
                    <UserButton.MenuItems>
                      <UserButton.Link
                        label="My Packages"
                        labelIcon={
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                            />
                          </svg>
                        }
                        href="/my-packages"
                      />
                    </UserButton.MenuItems>
                  </UserButton>
                )}
              </AuthGuard>
              <GuestGuard>
                <Link
                  to="/login"
                  className="text-sm font-medium text-mpak-gray-600 hover:text-mpak-gray-900 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-semibold text-mpak-dark bg-accent-gold-400 rounded-lg hover:bg-accent-gold-500 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:scale-105 transition-all"
                >
                  Sign Up
                </Link>
              </GuestGuard>
            </nav>

            {/* Mobile: auth + hamburger */}
            <div className="flex items-center gap-3 md:hidden">
              <AuthGuard>
                {authEnabled && (
                  <UserButton
                    afterSignOutUrl="/"
                    appearance={{
                      elements: {
                        avatarBox: "w-8 h-8",
                      },
                    }}
                  />
                )}
              </AuthGuard>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-mpak-gray-600 hover:text-mpak-gray-900 transition-colors p-1"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <nav aria-label="Mobile navigation" className="md:hidden border-t border-white/[0.08] bg-[#0c0a0f]/95 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col space-y-3">
              {navLinks}
              <GuestGuard>
                <div className="pt-3 border-t border-white/[0.08] flex flex-col space-y-3">
                  <Link
                    to="/login"
                    className="text-sm font-medium text-mpak-gray-600 hover:text-mpak-gray-900 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/login"
                    className="px-4 py-2 text-sm font-semibold text-mpak-dark bg-accent-gold-400 rounded-lg hover:bg-accent-gold-500 transition-all text-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign Up
                  </Link>
                </div>
              </GuestGuard>
            </div>
          </nav>
        )}
      </header>

      {/* Main content */}
      <main id="main" className="flex-1">
        {children ?? <Outlet />}
      </main>

      {/* Debug panel */}
      {import.meta.env.VITE_ENABLE_DEBUG_AUTH === "true" && (
        <AuthGuard>
          <DebugAuth />
        </AuthGuard>
      )}

      {/* Footer */}
      <footer role="contentinfo" className="border-t border-white/[0.08] mt-auto bg-surface-base">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-mpak-gray-500 text-sm">
              &copy; {new Date().getFullYear()} mpak is a{" "}
              <a
                href={siteConfig.operator.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mpak-gray-700 hover:text-accent-gold-400 transition-colors"
              >
                {siteConfig.operator.shortName}
              </a>{" "}
              project.
            </p>
            <nav aria-label="Footer navigation" className="flex items-center gap-6 text-sm">
              <Link
                to="/privacy"
                className="text-mpak-gray-500 hover:text-mpak-gray-700 transition-colors"
              >
                Privacy
              </Link>
              <Link
                to="/terms"
                className="text-mpak-gray-500 hover:text-mpak-gray-700 transition-colors"
              >
                Terms
              </Link>
              <Link
                to="/security"
                className="text-mpak-gray-500 hover:text-mpak-gray-700 transition-colors"
              >
                Security
              </Link>
              <Link
                to="/about"
                className="text-mpak-gray-500 hover:text-mpak-gray-700 transition-colors"
              >
                About
              </Link>
              <Link
                to="/contact"
                className="text-mpak-gray-500 hover:text-mpak-gray-700 transition-colors"
              >
                Contact
              </Link>
              <a
                href={siteConfig.github.repo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mpak-gray-500 hover:text-mpak-gray-700 transition-colors"
                aria-label="GitHub"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
