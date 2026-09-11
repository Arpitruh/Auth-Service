/**
 * Hand-authored OpenAPI 3.1 description of the auth-service surface
 * (Requirement 10.4). Kept in code (not a YAML asset) so it ships in the build
 * without a copy step and stays close to the routes it documents.
 */
export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Auth Service API',
    version: '2.0.0',
    description:
      'Authentication microservice: registration, login, token rotation with ' +
      'reuse detection, sessions, password reset, and admin user management.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
      PublicUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['USER', 'ADMIN'] },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/PublicUser' },
          accessToken: { type: 'string' },
        },
      },
      Credentials: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
        },
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        summary: 'Register a new user',
        requestBody: ref('Credentials'),
        responses: {
          '201': json('AuthResponse'),
          '400': json('Error'),
          '409': json('Error'),
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Log in',
        requestBody: ref('Credentials'),
        responses: { '200': json('AuthResponse'), '401': json('Error') },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate tokens using the refresh cookie',
        responses: { '200': json('AuthResponse'), '401': json('Error') },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Log out (revoke refresh token + denylist access token)',
        responses: { '200': { description: 'Logged out' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        summary: 'Request a password reset (always 200)',
        responses: { '200': { description: 'Accepted' } },
      },
    },
    '/auth/reset-password': {
      post: {
        summary: 'Reset password with a token; invalidates all sessions',
        responses: { '200': { description: 'Updated' }, '400': json('Error') },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        responses: { '200': json('PublicUser'), '401': json('Error') },
      },
    },
    '/auth/sessions': {
      get: {
        summary: "List the user's active sessions",
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Session list' }, '401': json('Error') },
      },
    },
    '/auth/sessions/{id}': {
      delete: {
        summary: 'Revoke one of the current user\'s sessions',
        security: [{ bearerAuth: [] }],
        parameters: [pathParam('id')],
        responses: {
          '200': { description: 'Revoked' },
          '401': json('Error'),
          '404': json('Error'),
        },
      },
    },
    '/admin/users': {
      get: {
        summary: 'List users (ADMIN only)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'User list' }, '403': json('Error') },
      },
    },
    '/admin/users/{id}/role': {
      patch: {
        summary: "Update a user's role (ADMIN only)",
        security: [{ bearerAuth: [] }],
        parameters: [pathParam('id')],
        responses: {
          '200': json('PublicUser'),
          '403': json('Error'),
          '404': json('Error'),
        },
      },
    },
  },
} as const;

function ref(schema: string) {
  return {
    required: true,
    content: {
      'application/json': { schema: { $ref: `#/components/schemas/${schema}` } },
    },
  };
}

function json(schema: string) {
  return {
    description: schema,
    content: {
      'application/json': { schema: { $ref: `#/components/schemas/${schema}` } },
    },
  };
}

function pathParam(name: string) {
  return {
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  };
}
