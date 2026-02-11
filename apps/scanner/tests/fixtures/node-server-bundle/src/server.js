/**
 * Clean Node.js MCP server for testing.
 * Uses safe patterns only - no shell execution, eval, etc.
 */

const { spawn } = require('child_process');

/**
 * Echo tool - returns the input message.
 * @param {string} message - The message to echo
 * @returns {object} The result containing the echoed message
 */
function echo(message) {
  return { result: message };
}

/**
 * Safe command execution using spawn with array arguments.
 * This is the recommended way to run external commands.
 * @param {string} command - The command to run
 * @param {string[]} args - Command arguments as an array
 * @returns {Promise<string>} The command output
 */
async function safeRun(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}

module.exports = { echo, safeRun };
