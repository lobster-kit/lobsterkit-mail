[**lobstermail**](../README.md)

***

[lobstermail](../README.md) / LobsterMail

# Class: LobsterMail

Defined in: packages/sdk/src/client.ts:47

LobsterMail client — the main entry point for the SDK.

Handles auto-signup, token management, and provides methods
for managing inboxes, webhooks, and account settings.

## Example

```typescript
const lm = await LobsterMail.create();
const inbox = await lm.createInbox();
const emails = await inbox.receive();
```

## Accessors

### token

#### Get Signature

> **get** **token**(): `string`

Defined in: packages/sdk/src/client.ts:105

The API token in use.

##### Returns

`string`

## Methods

### createInbox()

> **createInbox**(`opts?`): `Promise`\<[`Inbox`](Inbox.md)\>

Defined in: packages/sdk/src/client.ts:136

Create a new inbox.
By default generates a unique `lobster-xxxx@lobstermail.ai` address.
Optionally provide a custom `localPart` to choose your own handle.

#### Parameters

##### opts?

###### displayName?

`string`

###### localPart?

`string`

#### Returns

`Promise`\<[`Inbox`](Inbox.md)\>

#### Example

```typescript
const inbox = await lm.createInbox(); // lobster-7f3k@lobstermail.ai
const custom = await lm.createInbox({ localPart: 'billing-bot' }); // billing-bot@lobstermail.ai
```

***

### createWebhook()

> **createWebhook**(`opts`): `Promise`\<\{ `events`: `string`[]; `id`: `string`; `secret`: `string`; `url`: `string`; \}\>

Defined in: packages/sdk/src/client.ts:188

Register a webhook to receive real-time email notifications.

#### Parameters

##### opts

Webhook configuration

###### events?

`string`[]

Event types to subscribe to (default: `['email.received']`)

###### inboxId?

`string`

Scope to a specific inbox (omit for account-level)

###### url

`string`

HTTPS endpoint URL to receive webhook payloads

#### Returns

`Promise`\<\{ `events`: `string`[]; `id`: `string`; `secret`: `string`; `url`: `string`; \}\>

The created webhook with its HMAC signing secret

#### Example

```typescript
const wh = await lm.createWebhook({ url: 'https://example.com/hook' });
console.log(wh.secret); // Store this for signature verification
```

***

### deleteInbox()

> **deleteInbox**(`id`): `Promise`\<`void`\>

Defined in: packages/sdk/src/client.ts:169

Soft-delete an inbox. The inbox enters a 7-day grace period before permanent deletion.

#### Parameters

##### id

`string`

The inbox ID to delete

#### Returns

`Promise`\<`void`\>

#### Throws

[NotFoundError](NotFoundError.md) if the inbox does not exist

***

### deleteWebhook()

> **deleteWebhook**(`id`): `Promise`\<`void`\>

Defined in: packages/sdk/src/client.ts:216

Delete a webhook.

#### Parameters

##### id

`string`

The webhook ID to delete

#### Returns

`Promise`\<`void`\>

#### Throws

[NotFoundError](NotFoundError.md) if the webhook does not exist

***

### getAccount()

> **getAccount**(): `Promise`\<[`AccountInfo`](../interfaces/AccountInfo.md)\>

Defined in: packages/sdk/src/client.ts:121

Get account information including tier, limits, and usage.

#### Returns

`Promise`\<[`AccountInfo`](../interfaces/AccountInfo.md)\>

Account details with current tier, rate limits, and usage stats

#### Example

```typescript
const account = await lm.getAccount();
console.log(account.tierName); // 'anonymous' | 'verified' | 'established'
console.log(account.limits.canSend); // false for Tier 0
```

***

### getInbox()

> **getInbox**(`id`): `Promise`\<[`Inbox`](Inbox.md)\>

Defined in: packages/sdk/src/client.ts:148

Get an existing inbox by ID.

#### Parameters

##### id

`string`

The inbox ID (e.g. `ibx_...`)

#### Returns

`Promise`\<[`Inbox`](Inbox.md)\>

The inbox instance

#### Throws

[NotFoundError](NotFoundError.md) if the inbox does not exist

***

### listInboxes()

> **listInboxes**(): `Promise`\<[`Inbox`](Inbox.md)[]\>

Defined in: packages/sdk/src/client.ts:158

List all active inboxes for this account.

#### Returns

`Promise`\<[`Inbox`](Inbox.md)[]\>

Array of inbox instances

***

### listWebhooks()

> **listWebhooks**(): `Promise`\<\{ `data`: `any`[]; \}\>

Defined in: packages/sdk/src/client.ts:206

List all webhooks for this account.

#### Returns

`Promise`\<\{ `data`: `any`[]; \}\>

Object containing an array of webhook data

***

### create()

> `static` **create**(`config?`): `Promise`\<`LobsterMail`\>

Defined in: packages/sdk/src/client.ts:74

Create a LobsterMail client.

Token resolution order:
1. config.token (explicit)
2. LOBSTERMAIL_TOKEN env var
3. ~/.lobstermail/token file
4. Auto-signup via POST /v1/signup (unless autoSignup is false)

After auto-signup, the token is persisted to ~/.lobstermail/token.

#### Parameters

##### config?

[`LobsterMailConfig`](../interfaces/LobsterMailConfig.md)

#### Returns

`Promise`\<`LobsterMail`\>

#### Example

```typescript
const lm = await LobsterMail.create();
const inbox = await lm.createInbox();
const emails = await inbox.receive();
```
