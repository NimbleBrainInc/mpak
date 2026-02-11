/**
 * Global Error Handling Middleware
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { handleError } from './handler.js';

/**
 * Global error handler for Fastify
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  if (reply.sent) {
    return;
  }

  handleError(error, request, reply, {
    url: request.url,
    method: request.method,
    requestId: request.id,
  });
}

/**
 * Helper to wrap async route handlers with error handling
 */
export function asyncHandler<T = unknown>(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<T>
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const result = await handler(request, reply);

      if (!reply.sent && result !== undefined) {
        reply.send(result);
      }
    } catch (error) {
      handleError(error, request, reply, {
        handler: handler.name,
      });
    }
  };
}
