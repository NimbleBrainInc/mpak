import {
  generateMcpConfig,
  generateBaseMcpConfig,
  generateCliCommands,
  generateClaudeCodeCommand,
} from './manifest';

describe('generateMcpConfig', () => {
  it('returns basic config when manifest is null', () => {
    const result = JSON.parse(generateMcpConfig('@scope/server', null));
    expect(result).toEqual({
      mcpServers: {
        server: {
          command: 'mpak',
          args: ['run', '@scope/server'],
        },
      },
    });
  });

  it('returns basic config when manifest is undefined', () => {
    const result = JSON.parse(generateMcpConfig('@scope/server', undefined));
    expect(result.mcpServers.server).not.toHaveProperty('env');
  });

  it('extracts server name from scoped package', () => {
    const result = JSON.parse(generateMcpConfig('@nimblebraininc/ipinfo', null));
    expect(result.mcpServers).toHaveProperty('ipinfo');
  });

  it('uses full name when no scope', () => {
    const result = JSON.parse(generateMcpConfig('simple-server', null));
    expect(result.mcpServers).toHaveProperty('simple-server');
  });

  it('maps user_config + mcp_config.env to env vars', () => {
    const manifest = {
      user_config: {
        api_key: { type: 'string' as const, required: true, sensitive: true },
      },
      server: {
        type: 'python' as const,
        mcp_config: {
          command: 'python',
          args: ['-m', 'server'],
          env: {
            IPINFO_TOKEN: '${user_config.api_key}',
          },
        },
      },
    };
    const result = JSON.parse(generateMcpConfig('@nimblebraininc/ipinfo', manifest));
    expect(result.mcpServers.ipinfo.env).toEqual({
      IPINFO_TOKEN: 'YOUR_VALUE_HERE',
    });
  });

  it('omits env when user_config is empty', () => {
    const manifest = {
      user_config: {},
      server: { type: 'node' as const },
    };
    const result = JSON.parse(generateMcpConfig('@scope/pkg', manifest));
    expect(result.mcpServers.pkg).not.toHaveProperty('env');
  });
});

describe('generateBaseMcpConfig', () => {
  it('returns config without env', () => {
    const result = JSON.parse(generateBaseMcpConfig('@scope/server'));
    expect(result).toEqual({
      mcpServers: {
        server: {
          command: 'mpak',
          args: ['run', '@scope/server'],
        },
      },
    });
  });

  it('extracts server name from scoped package', () => {
    const result = JSON.parse(generateBaseMcpConfig('@nimblebraininc/echo'));
    expect(result.mcpServers).toHaveProperty('echo');
  });
});

describe('generateCliCommands', () => {
  it('returns empty array when no user_config', () => {
    expect(generateCliCommands('@scope/pkg', null)).toEqual([]);
    expect(generateCliCommands('@scope/pkg', undefined)).toEqual([]);
  });

  it('returns empty array when user_config is empty', () => {
    expect(generateCliCommands('@scope/pkg', { user_config: {} })).toEqual([]);
  });

  it('generates config set command with key=value pairs', () => {
    const manifest = {
      user_config: {
        api_key: { type: 'string' as const },
        region: { type: 'string' as const },
      },
    };
    const commands = generateCliCommands('@scope/pkg', manifest);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBe('mpak config set @scope/pkg api_key=YOUR_VALUE_HERE region=YOUR_VALUE_HERE');
  });
});

describe('generateClaudeCodeCommand', () => {
  it('returns basic command without env flags', () => {
    const result = generateClaudeCodeCommand('@scope/server', null);
    expect(result).toBe('claude mcp add --transport stdio server -- mpak run @scope/server');
  });

  it('includes env flags when user_config + mcp_config.env present', () => {
    const manifest = {
      user_config: {
        api_key: { type: 'string' as const },
      },
      server: {
        type: 'python' as const,
        mcp_config: {
          command: 'python',
          args: ['-m', 'server'],
          env: {
            API_KEY: '${user_config.api_key}',
          },
        },
      },
    };
    const result = generateClaudeCodeCommand('@scope/server', manifest);
    expect(result).toBe(
      'claude mcp add --transport stdio --env API_KEY=YOUR_VALUE_HERE server -- mpak run @scope/server',
    );
  });

  it('includes multiple env flags', () => {
    const manifest = {
      user_config: {
        api_key: { type: 'string' as const },
        secret: { type: 'string' as const },
      },
      server: {
        type: 'node' as const,
        mcp_config: {
          command: 'node',
          args: ['index.js'],
          env: {
            KEY: '${user_config.api_key}',
            SECRET: '${user_config.secret}',
          },
        },
      },
    };
    const result = generateClaudeCodeCommand('@scope/server', manifest);
    expect(result).toContain('--env KEY=YOUR_VALUE_HERE');
    expect(result).toContain('--env SECRET=YOUR_VALUE_HERE');
  });
});
