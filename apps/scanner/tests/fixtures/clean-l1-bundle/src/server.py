"""A clean MCP server for testing purposes.

This server intentionally contains no security issues and should pass
all Level 1 MTF controls.
"""

import json
import sys


def handle_echo(message: str) -> str:
    """Echo back the input message."""
    return message


def handle_add(a: float, b: float) -> float:
    """Add two numbers together."""
    return a + b


def process_request(request: dict) -> dict:
    """Process a JSON-RPC request."""
    method = request.get("method")
    params = request.get("params", {})
    request_id = request.get("id")

    if method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        if tool_name == "echo":
            result = handle_echo(arguments.get("message", ""))
        elif tool_name == "add":
            result = handle_add(arguments.get("a", 0), arguments.get("b", 0))
        else:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"},
            }

        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"content": [{"type": "text", "text": str(result)}]},
        }

    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32601, "message": f"Unknown method: {method}"},
    }


def main() -> None:
    """Main entry point for the MCP server."""
    for line in sys.stdin:
        try:
            request = json.loads(line)
            response = process_request(request)
            print(json.dumps(response), flush=True)
        except json.JSONDecodeError:
            error_response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": "Parse error"},
            }
            print(json.dumps(error_response), flush=True)


if __name__ == "__main__":
    main()
