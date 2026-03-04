[**lobstermail**](../README.md)

***

[lobstermail](../README.md) / Inbox

# Class: Inbox

Defined in: packages/sdk/src/inbox.ts:50

Represents an email inbox. Provides methods to receive, send,
and wait for emails.

## Example

```typescript
const inbox = await lm.createInbox();
const emails = await inbox.receive();
const email = await inbox.waitForEmail({ filter: { from: 'noreply@service.com' } });
```

## Constructors

### Constructor

> **new Inbox**(`data`, `http`): `Inbox`

Defined in: packages/sdk/src/inbox.ts:70

#### Parameters

##### data

[`InboxData`](../interfaces/InboxData.md)

##### http

`HttpClient`

#### Returns

`Inbox`

## Properties

### address

> `readonly` **address**: `string`

Defined in: packages/sdk/src/inbox.ts:54

Full email address (e.g. `lobster-xxxx@lobstermail.ai`).

***

### createdAt

> `readonly` **createdAt**: `string`

Defined in: packages/sdk/src/inbox.ts:66

When the inbox was created.

***

### displayName

> `readonly` **displayName**: `string` \| `null`

Defined in: packages/sdk/src/inbox.ts:56

Optional display name for the inbox.

***

### domain

> `readonly` **domain**: `string`

Defined in: packages/sdk/src/inbox.ts:58

Domain portion of the address.

***

### emailCount

> `readonly` **emailCount**: `number`

Defined in: packages/sdk/src/inbox.ts:62

Number of emails received.

***

### expiresAt

> `readonly` **expiresAt**: `string` \| `null`

Defined in: packages/sdk/src/inbox.ts:64

Expiration timestamp for Tier 0 inboxes, null for paid tiers.

***

### id

> `readonly` **id**: `string`

Defined in: packages/sdk/src/inbox.ts:52

Unique inbox identifier (e.g. `ibx_...`).

***

### isActive

> `readonly` **isActive**: `boolean`

Defined in: packages/sdk/src/inbox.ts:60

Whether the inbox is active (not deleted).

## Methods

### getEmail()

> **getEmail**(`emailId`): `Promise`\<[`Email`](Email.md)\>

Defined in: packages/sdk/src/inbox.ts:116

Get a single email by ID with full body.

#### Parameters

##### emailId

`string`

The email ID (e.g. `eml_...`)

#### Returns

`Promise`\<[`Email`](Email.md)\>

Email instance with body populated

#### Throws

[NotFoundError](NotFoundError.md) if the email does not exist in this inbox

***

### receive()

> **receive**(`opts?`): `Promise`\<[`Email`](Email.md)[]\>

Defined in: packages/sdk/src/inbox.ts:96

Poll for emails in this inbox.

#### Parameters

##### opts?

[`ReceiveOptions`](../interfaces/ReceiveOptions.md)

Filtering and pagination options

#### Returns

`Promise`\<[`Email`](Email.md)[]\>

Array of email instances (newest first)

#### Example

```typescript
const recent = await inbox.receive({ since: '2026-02-17T00:00:00Z', limit: 10 });
```

***

### send()

> **send**(`opts`): `Promise`\<\{ `id`: `string`; `status`: `string`; \}\>

Defined in: packages/sdk/src/inbox.ts:189

Send an email from this inbox. Requires Tier 1+ (verified account).

#### Parameters

##### opts

[`SendOptions`](../interfaces/SendOptions.md)

Email send options

#### Returns

`Promise`\<\{ `id`: `string`; `status`: `string`; \}\>

Object with queued email `id` and `status: 'queued'`

#### Throws

[InsufficientTierError](InsufficientTierError.md) if account is Tier 0

#### Example

```typescript
const result = await inbox.send({
  to: ['user@example.com'],
  subject: 'Hello from my agent',
  body: { text: 'This is a test email.' },
});
```

***

### waitForEmail()

> **waitForEmail**(`opts?`): `Promise`\<[`Email`](Email.md) \| `null`\>

Defined in: packages/sdk/src/inbox.ts:142

Wait for an email matching the given filter.
Polls with exponential backoff (2s, 3s, 4.5s... capped at 10s) up to the timeout.

#### Parameters

##### opts?

[`WaitForEmailOptions`](../interfaces/WaitForEmailOptions.md)

Filter and timing options

#### Returns

`Promise`\<[`Email`](Email.md) \| `null`\>

The matching email with full body loaded, or null if timeout is reached

#### Example

```typescript
const email = await inbox.waitForEmail({
  filter: { from: 'noreply@service.com', subject: /verification/i },
  timeout: 30000,
});
```
