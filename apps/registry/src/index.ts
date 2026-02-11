import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { config, validateConfig } from './config.js';
import { errorHandler } from './errors/index.js';
import { authPlugin } from './plugins/auth.js';
import prismaPlugin from './plugins/prisma.js';
import { storagePlugin } from './plugins/storage.js';
import { authRoutes } from './routes/auth.js';
import { packageRoutes } from './routes/packages.js';
import { scannerRoutes, securityRoutes } from './routes/scanner.js';
import { bundleRoutes } from './routes/v1/bundles.js';
import { skillRoutes } from './routes/v1/skills.js';
import { mcpRegistryRoutes } from './routes/mcp/v0.1/servers.js';

async function start() {
  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: config.server.nodeEnv === 'development' ? 'debug' : 'info',
    },
    bodyLimit: 50 * 1024 * 1024, // 50MB max payload size
  });

  // Use plain JSON.stringify for response serialization instead of fast-json-stringify.
  // This avoids strict schema validation errors while still using schemas for OpenAPI docs.
  // fast-json-stringify is very strict and requires exact schema matches, which is
  // incompatible with z.toJSONSchema() output for complex types like nullable unions.
  fastify.setReplySerializer((payload) => JSON.stringify(payload));

  // Register plugins
  await fastify.register(sensible);

  // Application-level rate limiting: 100 requests per minute per IP
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Register Swagger for OpenAPI documentation
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'mpak API',
        description: 'API documentation for the mpak backend server',
        version: '0.1.0',
      },
      servers: config.server.nodeEnv === 'production'
        ? [{ url: 'https://registry.mpak.dev', description: 'Production' }]
        : [
            { url: `http://localhost:${config.server.port}`, description: 'Development' },
            { url: 'https://registry.mpak.dev', description: 'Production' },
          ],
      tags: [
        { name: 'bundles', description: 'Bundle management API' },
        { name: 'skills', description: 'Agent Skills API' },
        { name: 'mcp-registry', description: 'MCP Registry API v0.1' },
        { name: 'health', description: 'Health check endpoints' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  // Register Swagger UI
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // CORS is configured per-route prefix below (app vs public API)

  await fastify.register(multipart, {
    limits: {
      fileSize: config.limits.maxBundleSizeMB * 1024 * 1024, // Convert MB to bytes
    },
  });

  // Register custom plugins
  await fastify.register(prismaPlugin); // New Prisma-based database layer
  await fastify.register(storagePlugin);
  await fastify.register(authPlugin);

  // Register global error handler
  fastify.setErrorHandler(errorHandler);

  // Register routes

  // Web app API - strict CORS, frontend origins only
  await fastify.register(async (instance) => {
    // CORS: development allows localhost, production requires explicit CORS_ORIGINS
    const appOrigin = config.server.nodeEnv === 'development'
      ? [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/]
      : config.server.corsOrigins;

    await instance.register(cors, {
      origin: appOrigin.length > 0 ? appOrigin : false,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
      credentials: true,
    });

    // Hide app routes from Swagger documentation
    instance.addHook('onRoute', (routeOptions) => {
      routeOptions.schema = routeOptions.schema ?? {};
      (routeOptions.schema as Record<string, unknown>)['hide'] = true;
    });
    await instance.register(authRoutes, { prefix: '/auth' });
    await instance.register(packageRoutes, { prefix: '/packages' });
    await instance.register(scannerRoutes); // /app/scan-results
  }, { prefix: '/app' });

  // Public API (CLI, OIDC) - open CORS, no cookies involved
  await fastify.register(async (instance) => {
    await instance.register(cors, {
      origin: true, // Allow any origin - public API uses Bearer tokens, not cookies
      methods: ['GET', 'HEAD', 'POST'],
      credentials: false, // No cookies, just Authorization header
    });
    // Stricter rate limit for bundle operations: 10 req/min per IP
    await instance.register(rateLimit, {
      max: 10,
      timeWindow: '1 minute',
    });
    await instance.register(bundleRoutes);
    await instance.register(securityRoutes); // /@:scope/:package/security routes
  }, { prefix: '/v1/bundles' });

  // Skills API
  await fastify.register(async (instance) => {
    await instance.register(cors, {
      origin: true,
      methods: ['GET', 'HEAD', 'POST'],
      credentials: false,
    });
    // Stricter rate limit for skill operations: 10 req/min per IP
    await instance.register(rateLimit, {
      max: 10,
      timeWindow: '1 minute',
    });
    await instance.register(skillRoutes);
  }, { prefix: '/v1/skills' });

  // MCP Registry API
  await fastify.register(async (instance) => {
    await instance.register(cors, {
      origin: true,
      methods: ['GET', 'HEAD'],
      credentials: false,
    });
    await instance.register(mcpRegistryRoutes);
  }, { prefix: '/v0.1' });

  // Health check endpoint
  fastify.get('/health', {
    schema: {
      tags: ['health'],
      description: 'Health check endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    handler: async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    },
  });

  // Graceful shutdown with timeout
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return; // Prevent multiple shutdown attempts
    isShuttingDown = true;

    console.log(`Received ${signal}, closing server...`);

    // Force exit after 10 seconds if graceful shutdown fails
    const forceExitTimeout = setTimeout(() => {
      console.error('Graceful shutdown timed out, forcing exit...');
      process.exit(1);
    }, 10000);

    try {
      await fastify.close();
      clearTimeout(forceExitTimeout);
      console.log('Server closed gracefully');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimeout);
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Start server
  try {
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    });
    console.log(`Server listening on ${config.server.host}:${config.server.port}`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

start();
