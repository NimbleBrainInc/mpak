import { describe, expect, it } from 'vitest';
import { createProgram } from '../src/program.js';

describe('createProgram', () => {
  it('should create a program with correct name', () => {
    const program = createProgram();
    expect(program.name()).toBe('mpak');
  });

  it('should have a description', () => {
    const program = createProgram();
    expect(program.description()).toBe('CLI for MCP bundles');
  });

  it('should have version option', () => {
    const program = createProgram();
    const versionOption = program.options.find(
      (opt) => opt.short === '-v' || opt.long === '--version',
    );
    expect(versionOption).toBeDefined();
  });
});
