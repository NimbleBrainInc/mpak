/**
 * Error Handler
 *
 * Converts internal errors (Prisma, etc.) to sanitized AppErrors
 * that can be safely exposed to the client.
 */

import { Prisma } from '@prisma/client';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  AppError,
  BadRequestError,
  ConflictError,
  DatabaseError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  TransactionTimeoutError,
  ValidationError,
} from './types.js';

/**
 * Error response shape sent to client
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Checks if an error is a Prisma error
 */
function isPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    ((error as Record<string, unknown>).code as string).startsWith('P')
  );
}

/**
 * Converts Prisma errors to AppErrors
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case 'P2002': {
      const target = error.meta?.target;
      const fieldName = Array.isArray(target) ? target.join(', ') : target;
      return new ConflictError('A record with this value already exists', {
        field: fieldName as string,
      });
    }

    case 'P2025':
      return new NotFoundError('The requested resource was not found');

    case 'P2003':
      return new BadRequestError('Invalid reference to related resource');

    case 'P2024':
      return new TransactionTimeoutError();

    case 'P2034':
      return new TransactionTimeoutError('Operation timeout - please try again');

    default:
      return new DatabaseError();
  }
}

/**
 * Error codes for client statuses a Fastify plugin can raise
 */
const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

/**
 * Converts any error to an AppError
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isPrismaError(error)) {
    return handlePrismaError(error);
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new DatabaseError('Database connection failed. Please try again later.');
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new ValidationError('Invalid data provided');
  }

  if ((error as FastifyError)?.statusCode === 400 && (error as FastifyError)?.validation) {
    return new ValidationError('Request validation failed', {
      validation: (error as FastifyError).validation,
    });
  }

  // An error a Fastify plugin raises with a client status (the rate limiter's
  // 429, a body that is too large, an unsupported content type) describes the
  // request, not a server fault, so its status reaches the client. Its message
  // is the plugin's own, written for the client.
  const statusCode = (error as FastifyError)?.statusCode;
  if (
    error instanceof Error &&
    typeof statusCode === 'number' &&
    statusCode >= 400 &&
    statusCode < 500
  ) {
    if (statusCode === 429) {
      return new RateLimitError(error.message);
    }
    return new AppError(
      error.message,
      statusCode,
      CLIENT_ERROR_CODES[statusCode] ?? 'CLIENT_ERROR',
    );
  }

  if (error instanceof Error) {
    return new InternalServerError();
  }

  return new InternalServerError('An unexpected error occurred');
}

/**
 * Formats an AppError for client response
 */
export function formatErrorResponse(error: AppError): ErrorResponse {
  const response: ErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (error.details && Object.keys(error.details).length > 0) {
    response.error.details = error.details;
  }

  return response;
}

/**
 * Logs error details for debugging
 */
export function logError(
  logger: FastifyRequest['log'],
  error: unknown,
  normalizedError: AppError,
  context?: Record<string, unknown>,
) {
  const logContext = {
    ...context,
    errorCode: normalizedError.code,
    statusCode: normalizedError.statusCode,
    isOperational: normalizedError.isOperational,
  };

  if (normalizedError.isOperational) {
    logger.warn(logContext, `Operational error: ${normalizedError.message}`);
  } else {
    if (error instanceof Error) {
      logger.error(
        {
          ...logContext,
          stack: error.stack,
          originalError: error.message,
          originalErrorName: error.name,
        },
        `Internal error: ${normalizedError.message}`,
      );
    } else {
      logger.error(
        {
          ...logContext,
          unknownError: String(error),
        },
        'Unknown error occurred',
      );
    }
  }
}

/**
 * Sends error response to client
 */
export function sendErrorResponse(reply: FastifyReply, error: AppError): void {
  const response = formatErrorResponse(error);
  reply.code(error.statusCode).send(response);
}

/**
 * Main error handling function
 */
export function handleError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  context?: Record<string, unknown>,
): void {
  const normalizedError = normalizeError(error);
  logError(request.log, error, normalizedError, context);
  sendErrorResponse(reply, normalizedError);
}
