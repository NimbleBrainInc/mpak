#!/usr/bin/env node

import { createProgram } from "./program.js";
import { handleError } from "./utils/errors.js";

async function main() {
  const program = createProgram();
  await program.parseAsync(process.argv);
}

main().catch(handleError);
