# Phase 4 — Hosted OpenID Connect authorization-code flow

**Status: opt-in development/staging implementation. Not production-certified.**
Existing `/api/v1/auth/*` and `/api/v2/tenant/*` APIs remain intact.
No SSO is shared between apps; users still live in separate databases.

## What works
- Registered applications and **exact redirect URI** validation against the central registry.
- Hosted, application-branded-by-name email/password sign-in at `GET /oauth/authorize`.
- OAuth Authorization Code grant with **mandatory PKCE S256**, nonce, state, and
  a CSRF-bound hosted login form.
- One-time 60-second authorization codes with atomic Redis `GETDEL` consumption.
- RS256-signed ID and access tokens, public JWKS, OpenID discovery and UserInfo.
- Token issuer, application audience, user subject and tenant database isolation.
- No shared login cookie: SSO remains off by default, including between apps on the
  same Auth deployment. OAuth does not use the global/legacy identity database.
- Existing tenant access-token format and secrets are unaffected.

## HTTP contract
| Method | Path | Purpose |
|---|---|---|
| GET | `/.well-known/openid-configuration` | Static supported metadata |
| GET | `/oauth/jwks` | Current RSA public signing key |
| GET | `/oauth/authorize` | Validate app and show hosted login |
| POST | `/oauth/authorize/complete` | Authenticate user and redirect with one-time code |
| POST | `/oauth/token` | Redeem code + S256 verifier for tokens |
| GET | `/oauth/userinfo` | Fetch active tenant identity from bearer token |

### Example authorization request
```
GET /oauth/authorize?
  response_type=code&
  client_id=authapp_...&
  redirect_uri=https%3A%2F%2Fclient.example.com%2Fcallback&
  scope=openid&
  state=<client-random-state>&
  nonce=<client-random-nonce>&
  code_challenge=<base64url-SHA256-verifier>&
  code_challenge_method=S256
```

The relying party must store state and the verifier in its own **same-origin
session**, verify the returned `state`, and send `code`, `client_id`,
`redirect_uri`, `code_verifier`, `grant_type=authorization_code` to
`/oauth/token`. Validate the resulting ID token's signature using JWKS,
`iss`, `aud`, `exp`, and `nonce`. Never trust an ID token solely because it
decodes successfully.

## Deployment prerequisites

Configure all of these on the **Auth Service backend**:
```dotenv
OIDC_ISSUER=https://auth.yourdomain.example
OIDC_PRIVATE_KEY_B64=<base64-of-PEM-2048-bit-or-larger-RSA-private-key>
OIDC_KEY_ID=<unique-8-to-64-char-kid>
REDIS_URL=rediss://...
CONTROL_PLANE_DATABASE_URL=postgresql://...
CONTROL_PLANE_ENCRYPTION_KEY=<separate-secret>
```
If OIDC settings are not configured, the endpoints return 503. In production
OIDC requires an HTTPS issuer and Redis. Never embed the signing private key,
tenant API keys or connection strings in the client application, source repo or
frontend environment variables.

**Key rotation:** This first iteration publishes one active JWK. Do **not**
replace the key without deploying an overlap/old-key verification period and
publishing older public JWKs until their tokens expire. Persist old keys using
a managed secret service before production adoption.

## Known constraints / roadmap
- No fully featured hosted signup, password reset, MFA, social login, app branding
  controls, consent screen, or dashboard editing in this phase.
- Only `openid` scope, a 5-minute access token/ID token, **no refresh_token**,
  no offline_access, no implicit flow, and no password grant.
- The login form expires after 5 minutes, and a failed password attempt consumes
  that flow; users must restart the authorization request.
- The provided `email_verified` claim is **false** until actual verified-email
  functionality is implemented; do not treat it as verified.
- Application-specific refresh sessions, logout, authorization code/device revocation,
  global token denylist and user session UIs are future work.
- This is an initial standards-shaped OIDC flow, **not** a certified provider.
  Before production, complete OIDC conformance, key rotation, CSRF and abuse testing,
  security review and staging deployment with real Neon tenant databases.
- The hosted login has a generic theme. Dashboard-managed branding is future work.
- The tenant registry contains only application settings; the transient code
  references are stored in Redis with short TTLs, not as shared user accounts.

## Tests

GitHub CI runs end-to-end:
1. Creates two separate tenant PostgreSQL databases and a control-plane database.
2. Registers a tenant and creates a user in its isolated database.
3. Rejects an unregistered redirect **without redirecting to the attacker**.
4. Loads hosted sign-in, authenticates, and validates the returned state.
5. Redeems the code and verifies the RS256 ID token against public JWKS.
6. Calls UserInfo and confirms same tenant identity.
7. Rejects replay and incorrect PKCE challenges.
8. Checks Redis `GETDEL` atomic single-use behavior with concurrent consumers.

**Production remains unchanged** until this work is reviewed, configured
and merged. No real Neon projects, users, or paid resources were created.
