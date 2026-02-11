---
name: verify-cli
description: Run smoke tests against the mpak CLI to verify all commands work correctly before publishing a new release.
---

# Verify CLI

Run a comprehensive set of smoke tests against the mpak CLI to catch regressions before publishing. This skill builds the CLI, then exercises every command category against the live production registry.

## Prerequisites

Before running tests, ensure the working directory is the mpak monorepo root (`apps/mpak`). Build the CLI and SDK fresh:

```
pnpm --filter @nimblebrain/mpak-sdk build && pnpm --filter @nimblebrain/mpak build
```

All test commands below should be run from `packages/cli/` using `node dist/index.js`.

## Test Procedure

Run each test group below. For every command:
1. Execute the command
2. Verify the exit code is 0 (unless testing error cases)
3. Verify the output matches the expected pattern described
4. Record PASS or FAIL with details

If any test fails, stop and report the failure with full output before continuing.

### 1. Version and Help

| # | Command | Expected |
|---|---------|----------|
| 1.1 | `node dist/index.js --version` | Prints a valid semver version (not "unknown") |
| 1.2 | `node dist/index.js --help` | Shows usage with commands: search, run, bundle, skill, config, completion |
| 1.3 | `node dist/index.js bundle --help` | Shows subcommands: search, show, pull, run |
| 1.4 | `node dist/index.js skill --help` | Shows subcommands: validate, pack, search, show, pull, install, list |

### 2. Unified Search

| # | Command | Expected |
|---|---------|----------|
| 2.1 | `node dist/index.js search "mcp"` | Returns results grouped into "Bundles (N):" and "Skills (N):" sections with separate tables |
| 2.2 | `node dist/index.js search "mcp" --type bundle` | Only shows "Bundles" section, no "Skills" section |
| 2.3 | `node dist/index.js search "mcp" --type skill` | Only shows "Skills" section, no "Bundles" section |
| 2.4 | `node dist/index.js search "mcp" --json` | Valid JSON with `results` array and `totals` object |
| 2.5 | `node dist/index.js search "mcp" --limit 2` | Each section shows at most 2 results |
| 2.6 | `node dist/index.js search "xyznonexistent999"` | Prints "No results found" message |

Verify that the Bundles table has columns: NAME, VERSION, TRUST, DESCRIPTION.
Verify that the Skills table has columns: NAME, VERSION, CATEGORY, DESCRIPTION.

### 3. Bundle Commands

Use `@nimblebraininc/echo` as the test bundle (known to exist with trust level L0).

| # | Command | Expected |
|---|---------|----------|
| 3.1 | `node dist/index.js bundle search "echo"` | Returns at least 1 result including `@nimblebraininc/echo` |
| 3.2 | `node dist/index.js bundle show @nimblebraininc/echo` | Shows name, version, type, trust level (L0), provenance, statistics, versions, platforms |
| 3.3 | `node dist/index.js bundle show @nimblebraininc/echo --json` | Valid JSON with `name`, `latest_version`, `certification_level` fields |
| 3.4 | `node dist/index.js bundle pull @nimblebraininc/echo -o /tmp/mpak-test-echo.mcpb` | Downloads file to /tmp/mpak-test-echo.mcpb, file exists and is non-empty |
| 3.5 | `node dist/index.js bundle show @nimblebraininc/doesnotexist` | Exits with error containing "not found" (case-insensitive) |

After test 3.4, clean up: `rm -f /tmp/mpak-test-echo.mcpb`

### 4. Skill Commands

Use `@nimblebraininc/skill-author` as the test skill (known to exist).

| # | Command | Expected |
|---|---------|----------|
| 4.1 | `node dist/index.js skill search "skill"` | Returns results including `@nimblebraininc/skill-author` |
| 4.2 | `node dist/index.js skill show @nimblebraininc/skill-author` | Shows name, version, description, metadata (category, tags, author), triggers, versions |
| 4.3 | `node dist/index.js skill show @nimblebraininc/skill-author --json` | Valid JSON with `name`, `latest_version`, `category` fields |
| 4.4 | `node dist/index.js skill pull @nimblebraininc/skill-author -o /tmp/mpak-test-skill.skill` | Downloads file, file exists and is non-empty |
| 4.5 | `node dist/index.js skill show @nimblebraininc/doesnotexist` | Exits with error containing "not found" (case-insensitive) |

After test 4.4, clean up: `rm -f /tmp/mpak-test-skill.skill`

### 5. Config Commands

These test the local config manager at `~/.mpak/config.json`.

| # | Command | Expected |
|---|---------|----------|
| 5.1 | `node dist/index.js config set @test/smoke-test smoke_key=smoke_value` | Succeeds with confirmation message |
| 5.2 | `node dist/index.js config get @test/smoke-test` | Shows `smoke_key` with masked value |
| 5.3 | `node dist/index.js config get @test/smoke-test --json` | Valid JSON containing `smoke_key` |
| 5.4 | `node dist/index.js config list` | Lists `@test/smoke-test` in output |
| 5.5 | `node dist/index.js config clear @test/smoke-test smoke_key` | Succeeds with confirmation |
| 5.6 | `node dist/index.js config clear @test/smoke-test` | Succeeds, clears entire package config |
| 5.7 | `node dist/index.js config get @test/smoke-test` | Shows no configuration or empty result |

### 6. Skill Validate and Pack (Local)

Test against the `verify-cli` skill directory itself (meta!).

| # | Command | Expected |
|---|---------|----------|
| 6.1 | `node dist/index.js skill validate ../../.claude/skills/verify-cli` | Reports validation result (may have warnings, should not error on structure) |

### 7. Error Handling

| # | Command | Expected |
|---|---------|----------|
| 7.1 | `node dist/index.js search` | Exits with non-zero code, shows error or help about missing argument |
| 7.2 | `node dist/index.js bundle invalid` | Shows help or error about unknown command |

## Reporting

After all tests complete, print a summary table:

```
## CLI Smoke Test Results

| Group              | Passed | Failed | Total |
|--------------------|--------|--------|-------|
| Version & Help     | N      | N      | 4     |
| Unified Search     | N      | N      | 6     |
| Bundle Commands    | N      | N      | 5     |
| Skill Commands     | N      | N      | 5     |
| Config Commands    | N      | N      | 7     |
| Local Skill Ops    | N      | N      | 1     |
| Error Handling     | N      | N      | 2     |
|--------------------|--------|--------|-------|
| TOTAL              | N      | N      | 30    |

Overall: PASS / FAIL
```

If any test failed, list each failure with its test number, command, expected result, and actual output.

The CLI is ready to publish only if all 30 tests pass.
