/**
 * Shell completion script generation for mpak CLI.
 *
 * Usage:
 *   eval "$(mpak completion bash)"
 *   eval "$(mpak completion zsh)"
 *   mpak completion fish | source
 */

const TOP_COMMANDS = [
  "search",
  "run",
  "bundle",
  "skill",
  "config",
  "completion",
  "help",
];

const BUNDLE_SUBCOMMANDS = ["search", "show", "pull", "run"];
const SKILL_SUBCOMMANDS = [
  "validate",
  "pack",
  "search",
  "show",
  "pull",
  "install",
  "list",
];
const CONFIG_SUBCOMMANDS = ["set", "get", "list", "clear"];
const COMPLETION_SHELLS = ["bash", "zsh", "fish"];

function bashScript(): string {
  return `# mpak bash completion
# Install: eval "$(mpak completion bash)"
# Or:      mpak completion bash >> ~/.bashrc

_mpak_completions() {
  local cur prev words cword
  _init_completion || return

  local top_commands="${TOP_COMMANDS.join(" ")}"
  local bundle_sub="${BUNDLE_SUBCOMMANDS.join(" ")}"
  local skill_sub="${SKILL_SUBCOMMANDS.join(" ")}"
  local config_sub="${CONFIG_SUBCOMMANDS.join(" ")}"
  local completion_shells="${COMPLETION_SHELLS.join(" ")}"

  case "\${cword}" in
    1)
      COMPREPLY=( $(compgen -W "\${top_commands}" -- "\${cur}") )
      return
      ;;
    2)
      case "\${prev}" in
        bundle)
          COMPREPLY=( $(compgen -W "\${bundle_sub}" -- "\${cur}") )
          return
          ;;
        skill)
          COMPREPLY=( $(compgen -W "\${skill_sub}" -- "\${cur}") )
          return
          ;;
        config)
          COMPREPLY=( $(compgen -W "\${config_sub}" -- "\${cur}") )
          return
          ;;
        completion)
          COMPREPLY=( $(compgen -W "\${completion_shells}" -- "\${cur}") )
          return
          ;;
      esac
      ;;
  esac
}

complete -F _mpak_completions mpak
`;
}

function zshScript(): string {
  return `#compdef mpak
# mpak zsh completion
# Install: eval "$(mpak completion zsh)"
# Or:      mpak completion zsh > ~/.zsh/completions/_mpak

_mpak() {
  local -a top_commands bundle_sub skill_sub config_sub completion_shells

  top_commands=(
    'search:Search bundles and skills'
    'run:Run an MCP server'
    'bundle:MCP bundle commands'
    'skill:Agent skill commands'
    'config:Manage per-package configuration'
    'completion:Generate shell completions'
    'help:Display help'
  )

  bundle_sub=(
    'search:Search public bundles'
    'show:Show bundle details'
    'pull:Download a bundle'
    'run:Run an MCP server from the registry'
  )

  skill_sub=(
    'validate:Validate a skill directory'
    'pack:Create a .skill bundle'
    'search:Search skills in the registry'
    'show:Show skill details'
    'pull:Download a .skill bundle'
    'install:Install a skill to ~/.claude/skills/'
    'list:List installed skills'
  )

  config_sub=(
    'set:Set config value(s) for a package'
    'get:Show stored config for a package'
    'list:List all packages with stored config'
    'clear:Clear config for a package'
  )

  completion_shells=(
    'bash:Generate bash completions'
    'zsh:Generate zsh completions'
    'fish:Generate fish completions'
  )

  if (( CURRENT == 2 )); then
    _describe -t commands 'mpak commands' top_commands
    return
  fi

  case "\${words[2]}" in
    bundle)
      if (( CURRENT == 3 )); then
        _describe -t commands 'bundle commands' bundle_sub
      fi
      ;;
    skill)
      if (( CURRENT == 3 )); then
        _describe -t commands 'skill commands' skill_sub
      fi
      ;;
    config)
      if (( CURRENT == 3 )); then
        _describe -t commands 'config commands' config_sub
      fi
      ;;
    completion)
      if (( CURRENT == 3 )); then
        _describe -t commands 'shells' completion_shells
      fi
      ;;
  esac
}

_mpak "$@"
`;
}

function fishScript(): string {
  return `# mpak fish completion
# Install: mpak completion fish | source
# Or:      mpak completion fish > ~/.config/fish/completions/mpak.fish

# Disable file completions by default
complete -c mpak -f

# Top-level commands
complete -c mpak -n '__fish_use_subcommand' -a search -d 'Search bundles and skills'
complete -c mpak -n '__fish_use_subcommand' -a run -d 'Run an MCP server'
complete -c mpak -n '__fish_use_subcommand' -a bundle -d 'MCP bundle commands'
complete -c mpak -n '__fish_use_subcommand' -a skill -d 'Agent skill commands'
complete -c mpak -n '__fish_use_subcommand' -a config -d 'Manage per-package configuration'
complete -c mpak -n '__fish_use_subcommand' -a completion -d 'Generate shell completions'
complete -c mpak -n '__fish_use_subcommand' -a help -d 'Display help'

# bundle subcommands
complete -c mpak -n '__fish_seen_subcommand_from bundle; and not __fish_seen_subcommand_from search show pull run' -a search -d 'Search public bundles'
complete -c mpak -n '__fish_seen_subcommand_from bundle; and not __fish_seen_subcommand_from search show pull run' -a show -d 'Show bundle details'
complete -c mpak -n '__fish_seen_subcommand_from bundle; and not __fish_seen_subcommand_from search show pull run' -a pull -d 'Download a bundle'
complete -c mpak -n '__fish_seen_subcommand_from bundle; and not __fish_seen_subcommand_from search show pull run' -a run -d 'Run an MCP server from the registry'

# skill subcommands
complete -c mpak -n '__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from validate pack search show pull install list' -a validate -d 'Validate a skill directory'
complete -c mpak -n '__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from validate pack search show pull install list' -a pack -d 'Create a .skill bundle'
complete -c mpak -n '__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from validate pack search show pull install list' -a search -d 'Search skills in the registry'
complete -c mpak -n '__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from validate pack search show pull install list' -a show -d 'Show skill details'
complete -c mpak -n '__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from validate pack search show pull install list' -a pull -d 'Download a .skill bundle'
complete -c mpak -n '__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from validate pack search show pull install list' -a install -d 'Install a skill to ~/.claude/skills/'
complete -c mpak -n '__fish_seen_subcommand_from skill; and not __fish_seen_subcommand_from validate pack search show pull install list' -a list -d 'List installed skills'

# config subcommands
complete -c mpak -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set get list clear' -a set -d 'Set config value(s) for a package'
complete -c mpak -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set get list clear' -a get -d 'Show stored config for a package'
complete -c mpak -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set get list clear' -a list -d 'List all packages with stored config'
complete -c mpak -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from set get list clear' -a clear -d 'Clear config for a package'

# completion subcommands
complete -c mpak -n '__fish_seen_subcommand_from completion; and not __fish_seen_subcommand_from bash zsh fish' -a bash -d 'Generate bash completions'
complete -c mpak -n '__fish_seen_subcommand_from completion; and not __fish_seen_subcommand_from bash zsh fish' -a zsh -d 'Generate zsh completions'
complete -c mpak -n '__fish_seen_subcommand_from completion; and not __fish_seen_subcommand_from bash zsh fish' -a fish -d 'Generate fish completions'
`;
}

export function handleCompletion(shell: string): void {
  switch (shell) {
    case "bash":
      process.stdout.write(bashScript());
      break;
    case "zsh":
      process.stdout.write(zshScript());
      break;
    case "fish":
      process.stdout.write(fishScript());
      break;
    default:
      process.stderr.write(
        `Unsupported shell: ${shell}\nSupported shells: bash, zsh, fish\n`,
      );
      process.exit(1);
  }
}
