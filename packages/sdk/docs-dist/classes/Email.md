[**lobstermail**](../README.md)

***

[lobstermail](../README.md) / Email

# Class: Email

Defined in: packages/sdk/src/email.ts:44

Represents an email message with security metadata and safe content access.

The key differentiator: provides injection-safe content formatting
for LLM consumption via [Email.safeBodyForLLM](#safebodyforllm).

## Example

```typescript
const email = await inbox.waitForEmail();
if (!email.isInjectionRisk) {
  const safe = email.safeBodyForLLM();
  // Pass `safe` to your LLM
}
```

## Constructors

### Constructor

> **new Email**(`data`, `http`): `Email`

Defined in: packages/sdk/src/email.ts:63

#### Parameters

##### data

[`EmailData`](../interfaces/EmailData.md)

##### http

`HttpClient`

#### Returns

`Email`

## Properties

### cc

> `readonly` **cc**: `string`[] \| `null`

Defined in: packages/sdk/src/email.ts:51

***

### createdAt

> `readonly` **createdAt**: `string`

Defined in: packages/sdk/src/email.ts:57

***

### direction

> `readonly` **direction**: `"inbound"` \| `"outbound"`

Defined in: packages/sdk/src/email.ts:48

***

### from

> `readonly` **from**: `string`

Defined in: packages/sdk/src/email.ts:49

***

### hasAttachments

> `readonly` **hasAttachments**: `boolean`

Defined in: packages/sdk/src/email.ts:54

***

### id

> `readonly` **id**: `string`

Defined in: packages/sdk/src/email.ts:46

Unique email identifier (e.g. `eml_...`).

***

### inboxId

> `readonly` **inboxId**: `string`

Defined in: packages/sdk/src/email.ts:47

***

### preview

> `readonly` **preview**: `string` \| `null`

Defined in: packages/sdk/src/email.ts:53

***

### receivedAt

> `readonly` **receivedAt**: `string` \| `null`

Defined in: packages/sdk/src/email.ts:58

***

### security

> `readonly` **security**: [`EmailSecurity`](../interfaces/EmailSecurity.md)

Defined in: packages/sdk/src/email.ts:55

***

### status

> `readonly` **status**: `string` \| `null`

Defined in: packages/sdk/src/email.ts:56

***

### subject

> `readonly` **subject**: `string`

Defined in: packages/sdk/src/email.ts:52

***

### to

> `readonly` **to**: `string`[]

Defined in: packages/sdk/src/email.ts:50

## Accessors

### body

#### Get Signature

> **get** **body**(): `string` \| `null`

Defined in: packages/sdk/src/email.ts:85

Raw email body text. May be null if body hasn't been fetched.
Call `fetchFullBody()` to load the body lazily.

##### Returns

`string` \| `null`

***

### isInjectionRisk

#### Get Signature

> **get** **isInjectionRisk**(): `boolean`

Defined in: packages/sdk/src/email.ts:93

Whether this email has a high injection risk score (>= 0.5).
Check this before passing email content to an LLM.

##### Returns

`boolean`

## Methods

### fetchFullBody()

> **fetchFullBody**(): `Promise`\<`void`\>

Defined in: packages/sdk/src/email.ts:122

Lazy-load the full email body from S3 via the API.
After calling this, `this.body` will be populated.

#### Returns

`Promise`\<`void`\>

***

### safeBodyForLLM()

> **safeBodyForLLM**(): `string`

Defined in: packages/sdk/src/email.ts:105

Format the email body for safe LLM consumption.

Wraps the content with clear boundary markers, includes metadata,
and strips any injected boundary markers from the body itself.

#### Returns

`string`

Formatted string safe to include in an LLM prompt
