/**
 * Hand-authored OpenAPI 3.1 description of the auth-service surface
 * (Requirement 10.4). Kept in code (not a YAML asset) so it ships in the build
 * without a copy step and stays close to the routes it documents.
 */
export declare const openapiSpec: {
    readonly openapi: '3.1.0';
    readonly info: {
        readonly title: 'Auth Service API';
        readonly version: '2.0.0';
        readonly description: string;
    };
    readonly servers: readonly [{
        readonly url: '/api/v1';
    }];
    readonly components: {
        readonly securitySchemes: {
            readonly bearerAuth: {
                readonly type: 'http';
                readonly scheme: 'bearer';
                readonly bearerFormat: 'JWT';
            };
        };
        readonly schemas: {
            readonly Error: {
                readonly type: 'object';
                readonly properties: {
                    readonly error: {
                        readonly type: 'object';
                        readonly properties: {
                            readonly code: {
                                readonly type: 'string';
                            };
                            readonly message: {
                                readonly type: 'string';
                            };
                            readonly requestId: {
                                readonly type: 'string';
                            };
                        };
                    };
                };
            };
            readonly PublicUser: {
                readonly type: 'object';
                readonly properties: {
                    readonly id: {
                        readonly type: 'string';
                    };
                    readonly email: {
                        readonly type: 'string';
                        readonly format: 'email';
                    };
                    readonly role: {
                        readonly type: 'string';
                        readonly enum: readonly ['USER', 'ADMIN'];
                    };
                };
            };
            readonly AuthResponse: {
                readonly type: 'object';
                readonly properties: {
                    readonly user: {
                        readonly $ref: '#/components/schemas/PublicUser';
                    };
                    readonly accessToken: {
                        readonly type: 'string';
                    };
                };
            };
            readonly Credentials: {
                readonly type: 'object';
                readonly required: readonly ['email', 'password'];
                readonly properties: {
                    readonly email: {
                        readonly type: 'string';
                        readonly format: 'email';
                    };
                    readonly password: {
                        readonly type: 'string';
                        readonly format: 'password';
                    };
                };
            };
        };
    };
    readonly paths: {
        readonly '/auth/register': {
            readonly post: {
                readonly summary: 'Register a new user';
                readonly requestBody: {
                    required: boolean;
                    content: {
                        'application/json': {
                            schema: {
                                $ref: string;
                            };
                        };
                    };
                };
                readonly responses: {
                    readonly '201': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    readonly '400': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    readonly '409': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly '/auth/login': {
            readonly post: {
                readonly summary: 'Log in';
                readonly requestBody: {
                    required: boolean;
                    content: {
                        'application/json': {
                            schema: {
                                $ref: string;
                            };
                        };
                    };
                };
                readonly responses: {
                    readonly '200': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    readonly '401': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly '/auth/refresh': {
            readonly post: {
                readonly summary: 'Rotate tokens using the refresh cookie';
                readonly responses: {
                    readonly '200': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    readonly '401': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly '/auth/logout': {
            readonly post: {
                readonly summary: 'Log out (revoke refresh token + denylist access token)';
                readonly responses: {
                    readonly '200': {
                        readonly description: 'Logged out';
                    };
                };
            };
        };
        readonly '/auth/forgot-password': {
            readonly post: {
                readonly summary: 'Request a password reset (always 200)';
                readonly responses: {
                    readonly '200': {
                        readonly description: 'Accepted';
                    };
                };
            };
        };
        readonly '/auth/reset-password': {
            readonly post: {
                readonly summary: 'Reset password with a token; invalidates all sessions';
                readonly responses: {
                    readonly '200': {
                        readonly description: 'Updated';
                    };
                    readonly '400': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly '/auth/me': {
            readonly get: {
                readonly summary: 'Current user';
                readonly security: readonly [{
                    readonly bearerAuth: readonly [];
                }];
                readonly responses: {
                    readonly '200': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    readonly '401': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly '/auth/sessions': {
            readonly get: {
                readonly summary: "List the user's active sessions";
                readonly security: readonly [{
                    readonly bearerAuth: readonly [];
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: 'Session list';
                    };
                    readonly '401': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly '/auth/sessions/{id}': {
            readonly delete: {
                readonly summary: 'Revoke one of the current user\'s sessions';
                readonly security: readonly [{
                    readonly bearerAuth: readonly [];
                }];
                readonly parameters: readonly [{
                    name: string;
                    in: string;
                    required: boolean;
                    schema: {
                        type: string;
                    };
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: 'Revoked';
                    };
                    readonly '401': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    readonly '404': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly '/admin/users': {
            readonly get: {
                readonly summary: 'List users (ADMIN only)';
                readonly security: readonly [{
                    readonly bearerAuth: readonly [];
                }];
                readonly responses: {
                    readonly '200': {
                        readonly description: 'User list';
                    };
                    readonly '403': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly '/admin/users/{id}/role': {
            readonly patch: {
                readonly summary: "Update a user's role (ADMIN only)";
                readonly security: readonly [{
                    readonly bearerAuth: readonly [];
                }];
                readonly parameters: readonly [{
                    name: string;
                    in: string;
                    required: boolean;
                    schema: {
                        type: string;
                    };
                }];
                readonly responses: {
                    readonly '200': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    readonly '403': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                    readonly '404': {
                        description: string;
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: string;
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
//# sourceMappingURL=openapi.d.ts.map