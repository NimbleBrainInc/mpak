# @nimblebrain/mpak

CLI for downloading MCPB bundles and Agent Skills from the [mpak registry](https://mpak.dev).

## Installation

```bash
npm install -g @nimblebrain/mpak
```

## Usage

### Search

Search across both bundles and skills:

```bash
mpak search <query>
mpak search <query> --type bundle
mpak search <query> --type skill
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

### Skills

```bash
# Validate a skill directory
mpak skill validate ./path/to/skill

# Pack a skill into a .skill bundle
mpak skill pack ./path/to/skill

# Search skills in the registry
mpak skill search <query>

# Show skill details
mpak skill show @scope/name

# Download a .skill bundle
mpak skill pull @scope/name

# Install a skill to ~/.claude/skills/
mpak skill install @scope/name

# List installed skills
mpak skill list
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
