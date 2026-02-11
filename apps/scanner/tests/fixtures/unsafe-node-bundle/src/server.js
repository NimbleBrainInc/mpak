/**
 * UNSAFE Node.js MCP server for testing CQ-05 pattern detection.
 * Contains intentional security anti-patterns.
 * DO NOT USE IN PRODUCTION.
 */

const { exec } = require('child_process');

/**
 * UNSAFE: Uses child_process.exec which runs through shell.
 * Should be detected by CQ-05 child-process-exec pattern.
 */
function runCommand(userInput) {
  // UNSAFE: shell injection vulnerability
  child_process.exec(`ls ${userInput}`, (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(stdout);
  });
}

/**
 * UNSAFE: Uses eval to execute arbitrary code.
 * Should be detected by CQ-05 eval-js pattern.
 */
function dangerousEval(code) {
  // UNSAFE: code injection vulnerability
  return eval(code);
}

/**
 * UNSAFE: Uses new Function to create dynamic code.
 * Should be detected by CQ-05 new-function pattern.
 */
function createFunction(body) {
  // UNSAFE: code injection vulnerability
  return new Function('x', body);
}

/**
 * UNSAFE: Uses setTimeout with a string argument.
 * Should be detected by CQ-05 settimeout-string pattern.
 */
function delayedExec() {
  // UNSAFE: implicit eval
  setTimeout("console.log('executed')", 1000);
}

/**
 * UNSAFE: Uses innerHTML assignment.
 * Should be detected by CQ-05 innerhtml-assignment pattern.
 */
function setContent(element, userInput) {
  // UNSAFE: XSS vulnerability
  element.innerHTML = userInput;
}

/**
 * UNSAFE: Uses SQL template literal.
 * Should be detected by CQ-05 sql-template-literal pattern.
 */
async function unsafeQuery(db, userId) {
  // UNSAFE: SQL injection vulnerability
  return db.query(`SELECT * FROM users WHERE id = ${userId}`);
}

module.exports = {
  runCommand,
  dangerousEval,
  createFunction,
  delayedExec,
  setContent,
  unsafeQuery,
};
