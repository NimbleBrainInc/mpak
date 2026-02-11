import { useState, useMemo } from 'react';
import { MCPBManifest, generateMcpConfig, generateBaseMcpConfig, generateCliCommands, generateClaudeCodeCommand } from '../lib/manifest';

interface ConfigurationPanelProps {
  packageName: string;
  manifest: Record<string, unknown> | MCPBManifest | null | undefined;
}

type ConfigClient = 'claude-code' | 'claude-desktop';

export default function ConfigurationPanel({ packageName, manifest }: ConfigurationPanelProps) {
  const [client, setClient] = useState<ConfigClient>('claude-code');
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedBaseJson, setCopiedBaseJson] = useState(false);
  const [copiedCli, setCopiedCli] = useState<number | null>(null);

  const claudeCodeCommand = useMemo(() => generateClaudeCodeCommand(packageName, manifest), [packageName, manifest]);
  const jsonConfig = useMemo(() => generateMcpConfig(packageName, manifest), [packageName, manifest]);
  const baseJsonConfig = useMemo(() => generateBaseMcpConfig(packageName), [packageName]);
  const cliCommands = useMemo(() => generateCliCommands(packageName, manifest), [packageName, manifest]);

  // Only show CLI tab if there are config commands to show
  const hasCliCommands = cliCommands.length > 0;

  async function copyClaudeCodeCommand() {
    await navigator.clipboard.writeText(claudeCodeCommand);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  }

  async function copyJson() {
    await navigator.clipboard.writeText(jsonConfig);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  }

  async function copyBaseJson() {
    await navigator.clipboard.writeText(baseJsonConfig);
    setCopiedBaseJson(true);
    setTimeout(() => setCopiedBaseJson(false), 2000);
  }

  async function copyCliCommand(index: number, command: string) {
    await navigator.clipboard.writeText(command);
    setCopiedCli(index);
    setTimeout(() => setCopiedCli(null), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Client Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-mpak-gray-700">Configuration</h3>
        <div className="relative flex bg-surface rounded-lg p-0.5">
          {/* Animated background pill */}
          <div
            className={`
              absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-surface-raised rounded-md shadow-sm
              transition-transform duration-200 ease-out
              ${client === 'claude-desktop' ? 'translate-x-full' : 'translate-x-0'}
            `}
          />
          <button
            onClick={() => setClient('claude-code')}
            className={`
              relative z-10 px-4 py-1.5 text-xs font-medium rounded-md transition-colors duration-200
              ${client === 'claude-code' ? 'text-mpak-gray-900' : 'text-mpak-gray-500 hover:text-mpak-gray-700'}
            `}
          >
            Claude Code
          </button>
          <button
            onClick={() => setClient('claude-desktop')}
            className={`
              relative z-10 px-4 py-1.5 text-xs font-medium rounded-md transition-colors duration-200
              ${client === 'claude-desktop' ? 'text-mpak-gray-900' : 'text-mpak-gray-500 hover:text-mpak-gray-700'}
            `}
          >
            Claude Desktop
          </button>
        </div>
      </div>

      {/* Claude Code Panel */}
      {client === 'claude-code' && (
        <div className="space-y-4">
          <div className="group relative">
            <div className="absolute -inset-px bg-gradient-to-r from-emerald-400/20 via-emerald-500/20 to-teal-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />
            <div className="relative bg-surface-base rounded-xl overflow-hidden border border-white/[0.08]">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                  <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                  <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
                  <span className="ml-3 text-xs text-mpak-gray-500 font-mono">Terminal</span>
                </div>
                <button
                  onClick={copyClaudeCodeCommand}
                  className="flex items-center gap-1.5 text-xs text-mpak-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/[0.06]"
                >
                  {copiedCommand ? (
                    <>
                      <CheckIcon className="w-3.5 h-3.5 text-terminal-success" />
                      <span className="text-terminal-success">Copied</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              {/* Code */}
              <div className="p-4 overflow-x-auto">
                <code className="font-mono text-sm text-mpak-gray-800">
                  <span className="text-terminal-success select-none">$ </span>
                  <CliHighlight command={claudeCodeCommand} />
                </code>
              </div>
            </div>
          </div>
          <p className="text-xs text-mpak-gray-500">
            Run this command in your terminal to add the MCP server to Claude Code.
            {hasCliCommands && (
              <> Replace <code className="bg-accent-gold-400/15 text-accent-gold-400 px-1 py-0.5 rounded">YOUR_VALUE_HERE</code> with your actual values.</>
            )}
          </p>
        </div>
      )}

      {/* Claude Desktop Panel */}
      {client === 'claude-desktop' && (
        <div className="space-y-5">
          {/* JSON Config */}
          {!hasCliCommands ? (
            <div className="group relative">
              <div className="absolute -inset-px bg-gradient-to-r from-accent-gold-400/20 via-accent-gold-500/20 to-accent-gold-600/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />
              <div className="relative bg-surface-base rounded-xl overflow-hidden border border-white/[0.08]">
                <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                    <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                    <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
                    <span className="ml-3 text-xs text-mpak-gray-500 font-mono">claude_desktop_config.json</span>
                  </div>
                  <button
                    onClick={copyJson}
                    className="flex items-center gap-1.5 text-xs text-mpak-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/[0.06]"
                  >
                    {copiedJson ? (
                      <>
                        <CheckIcon className="w-3.5 h-3.5 text-terminal-success" />
                        <span className="text-terminal-success">Copied</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-4 overflow-x-auto">
                  <pre className="font-mono text-sm leading-relaxed">
                    <JsonHighlight code={jsonConfig} />
                  </pre>
                </div>
              </div>
              <p className="mt-2 text-xs text-mpak-gray-500">
                Add this to your <code className="bg-surface-overlay px-1.5 py-0.5 rounded text-mpak-gray-700">claude_desktop_config.json</code>
              </p>
            </div>
          ) : (
            <>
              {/* Step 1: Add JSON config */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-gold-400 text-mpak-dark text-xs font-bold">1</span>
                  <span className="text-sm font-medium text-mpak-gray-700">Add to config file</span>
                </div>
                <div className="group relative">
                  <div className="absolute -inset-px bg-gradient-to-r from-accent-gold-400/20 via-accent-gold-500/20 to-accent-gold-600/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />
                  <div className="relative bg-surface-base rounded-xl overflow-hidden border border-white/[0.08]">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-white/[0.08]">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                        <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                        <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
                        <span className="ml-3 text-xs text-mpak-gray-500 font-mono">claude_desktop_config.json</span>
                      </div>
                      <button
                        onClick={copyBaseJson}
                        className="flex items-center gap-1.5 text-xs text-mpak-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/[0.06]"
                      >
                        {copiedBaseJson ? (
                          <>
                            <CheckIcon className="w-3.5 h-3.5 text-terminal-success" />
                            <span className="text-terminal-success">Copied</span>
                          </>
                        ) : (
                          <>
                            <CopyIcon className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-4 overflow-x-auto">
                      <pre className="font-mono text-sm leading-relaxed">
                        <JsonHighlight code={baseJsonConfig} />
                      </pre>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Configure secrets via CLI */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-gold-400 text-mpak-dark text-xs font-bold">2</span>
                  <span className="text-sm font-medium text-mpak-gray-700">Configure secrets</span>
                </div>
                <div className="group relative">
                  <div className="absolute -inset-px bg-gradient-to-r from-emerald-400/20 via-emerald-500/20 to-teal-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm" />
                  <div className="relative bg-surface-base rounded-xl overflow-hidden border border-white/[0.08]">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-white/[0.08]">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                        <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                        <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
                        <span className="ml-3 text-xs text-mpak-gray-500 font-mono">Terminal</span>
                      </div>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                      {cliCommands.map((command, index) => (
                        <div
                          key={index}
                          className="group/cmd flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition-colors"
                        >
                          <code className="font-mono text-sm text-mpak-gray-800">
                            <span className="text-terminal-success select-none">$ </span>
                            <CliHighlight command={command} />
                          </code>
                          <button
                            onClick={() => copyCliCommand(index, command)}
                            className="flex-shrink-0 opacity-0 group-hover/cmd:opacity-100 text-mpak-gray-400 hover:text-white transition-all p-1.5 rounded hover:bg-white/[0.06]"
                          >
                            {copiedCli === index ? (
                              <CheckIcon className="w-4 h-4 text-terminal-success" />
                            ) : (
                              <CopyIcon className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-mpak-gray-500">
                  Replace <code className="bg-accent-gold-400/15 text-accent-gold-400 px-1 py-0.5 rounded">YOUR_VALUE_HERE</code> with your actual values. Secrets are stored locally by mpak.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Simple JSON syntax highlighting
function JsonHighlight({ code }: { code: string }) {
  const lines = code.split('\n');

  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre">
          {highlightJsonLine(line)}
        </div>
      ))}
    </>
  );
}

function highlightJsonLine(line: string): React.ReactNode {
  // Match different JSON parts
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let keyIndex = 0;

  // Process the line character by character for proper highlighting
  while (remaining.length > 0) {
    // Match leading whitespace
    const wsMatch = remaining.match(/^(\s+)/);
    if (wsMatch && wsMatch[1]) {
      parts.push(<span key={`ws-${keyIndex++}`}>{wsMatch[1]}</span>);
      remaining = remaining.slice(wsMatch[1].length);
      continue;
    }

    // Match string key (before colon)
    const keyMatch = remaining.match(/^("[\w\-_.]+")\s*:/);
    if (keyMatch && keyMatch[1]) {
      parts.push(<span key={`key-${keyIndex++}`} className="text-[#7ee787]">{keyMatch[1]}</span>);
      remaining = remaining.slice(keyMatch[1].length);
      continue;
    }

    // Match string value
    const strMatch = remaining.match(/^("(?:[^"\\]|\\.)*")/);
    if (strMatch && strMatch[1]) {
      const value = strMatch[1];
      const isPlaceholder = value.includes('YOUR_VALUE_HERE');
      parts.push(
        <span key={`str-${keyIndex++}`} className={isPlaceholder ? 'text-amber-400 bg-amber-400/10 px-0.5 rounded' : 'text-[#a5d6ff]'}>
          {value}
        </span>
      );
      remaining = remaining.slice(value.length);
      continue;
    }

    // Match brackets and punctuation
    const punctMatch = remaining.match(/^([{}\[\]:,])/);
    if (punctMatch) {
      const punct = punctMatch[1];
      const color = punct === '{' || punct === '}' ? 'text-[#ffa657]' :
                    punct === '[' || punct === ']' ? 'text-[#ff7b72]' : 'text-mpak-gray-400';
      parts.push(<span key={`punct-${keyIndex++}`} className={color}>{punct}</span>);
      remaining = remaining.slice(1);
      continue;
    }

    // Fallback: take one character
    parts.push(<span key={`char-${keyIndex++}`} className="text-mpak-gray-700">{remaining[0]}</span>);
    remaining = remaining.slice(1);
  }

  return parts;
}

// CLI command syntax highlighting
function CliHighlight({ command }: { command: string }) {
  const parts = command.split(/(\s+)/);

  return (
    <>
      {parts.map((part, i) => {
        if (part.match(/^\s+$/)) {
          return <span key={i}>{part}</span>;
        }
        if (i === 0) {
          // Command name
          return <span key={i} className="text-[#ffa657]">{part}</span>;
        }
        if (part.startsWith('--')) {
          // Flag
          return <span key={i} className="text-[#ff7b72]">{part}</span>;
        }
        if (part.startsWith('@') || part.startsWith('-')) {
          // Package name or short flag
          return <span key={i} className="text-[#a5d6ff]">{part}</span>;
        }
        if (part.includes('=')) {
          // Key=value pair
          const [key, ...valueParts] = part.split('=');
          const value = valueParts.join('=');
          const isPlaceholder = value === 'YOUR_VALUE_HERE';
          return (
            <span key={i}>
              <span className="text-[#7ee787]">{key}</span>
              <span className="text-mpak-gray-400">=</span>
              <span className={isPlaceholder ? 'text-amber-400 bg-amber-400/10 px-0.5 rounded' : 'text-[#a5d6ff]'}>{value}</span>
            </span>
          );
        }
        // Other args
        return <span key={i} className="text-mpak-gray-800">{part}</span>;
      })}
    </>
  );
}

// Icons
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
