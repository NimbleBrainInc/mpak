# @nimblebrain/mpak

CLI for downloading MCPB bundles from the [mpak registry](https://mpak.dev).

## Installation

```bash
npm install -g @nimblebrain/mpak
```

## Usage

### Search

Search bundles:

```bash
mpak search <query>
```

### Bundles

```bash
# Search bundles
mpak bundle search <query>

# Show bundle details
mpak bundle show @scope/name

# Download a bundle
mpak bundle pull @scope/name
mpak bundle pull @scope/name@1.0.0

# Run an MCP server from the registry
mpak run @scope/name
mpak bundle run @scope/name --update
mpak bundle run --local ./path/to/bundle.mcpb
```

### Configuration

```bash
# Set config values for a package
mpak config set @scope/name api_key=xxx

# View stored config (values are masked)
mpak config get @scope/name

# List packages with config
mpak config list

# Clear config
mpak config clear @scope/name
mpak config clear @scope/name api_key
```

## Development

```bash
# Build
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Lint
pnpm lint
```

## License

Apache-2.0
