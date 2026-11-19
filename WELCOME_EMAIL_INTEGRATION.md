# Automatic welcome email per application

Each successful account registration should enqueue the application's **published**
`welcome` email template from the Notification Service. Email delivery must not
block or roll back the created user; a failure is logged without exposing secrets.

## What is wired

- Legacy `POST /api/v1/auth/register`: after registration succeeds, uses
  `NOTIFICATION_SERVICE_URL` and `NOTIFICATION_API_KEY` to send the
  `auth-service` application's `welcome` email.
- Tenant `POST /api/v2/tenant/register`: after registration succeeds, looks up
  `WELCOME_NOTIFICATION_APPS[tenant.id]` for that tenant's unique Notification
  Service key, app name, and dashboard URL.
- Existing registrations do not receive historical welcome mail. Only newly
  registered accounts trigger an event.
- Other standalone applications **must integrate** their own successful
  registration path with `POST /api/v1/notifications/send` using their own
  server-side API key; the Notification Service cannot detect registrations in
  an arbitrary application's database automatically.

## Preparation

1. In Notification Garden, create an application (e.g. slug `auth-service`).
2. In that application, publish a `welcome` email template. Include dynamic
   variables `name`, `appName`, `dashboardUrl`. The required variable schema
   must list those values, **not** the template display name.
3. On the Notification Service set `APP_API_KEYS` with a unique random value
   per application. The key is selected by its authenticated app identity.
4. On the Auth Service backend configure `NOTIFICATION_SERVICE_URL` and
   `NOTIFICATION_API_KEY` with the `auth-service` key. Set
   `WELCOME_APP_NAME` and `WELCOME_DASHBOARD_URL` (a verified login page).
5. For a registered tenant, map its **Auth Service tenant UUID** to its separate
   Notification Garden API key and public metadata:

```dotenv
WELCOME_NOTIFICATION_APPS='{"tenant-uuid":{"apiKey":"app-key-secret","appName":"CRM","dashboardUrl":"https://crm.example.com"}}'
```

These are server environment variables, never browser globals or committed secrets.

## Expected request and status

```json
{
  "recipient":"new-user@example.com",
  "channel":"email",
  "templateId":"welcome",
  "payloadData":{
    "name":"there",
    "appName":"Auth Garden",
    "dashboardUrl":"https://login-service-8akx.onrender.com/dashboard"
  },
  "idempotencyKey":"registration-welcome:<sha256-of-app-context-and-user-id>"
}
```

Auth calls Notification Service with its `x-api-key` header. HTTP 202 means
**queued**, not delivered. Provider acceptance, inbox arrival, and spam placement
must be checked independently. A missing key or missing published template logs a
warning and registration still returns 201.

## Remaining reliability gap

The initial implementation performs a bounded best-effort HTTP call after the
user is written. Crash/restart at this boundary can lose the welcome event.
For guaranteed eventually consistent delivery, persist a registration outbox event
in the same database transaction that creates the user, then deliver via a retrying
worker. Use the notification ID/idempotency key to avoid duplicates.
