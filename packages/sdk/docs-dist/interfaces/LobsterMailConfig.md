[**lobstermail**](../README.md)

***

[lobstermail](../README.md) / LobsterMailConfig

# Interface: LobsterMailConfig

Defined in: packages/sdk/src/client.ts:8

## Properties

### autoSignup?

> `optional` **autoSignup**: `boolean`

Defined in: packages/sdk/src/client.ts:14

Disable auto-signup when no token is found. Default: true (auto-signup enabled).

***

### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: packages/sdk/src/client.ts:12

API base URL. Defaults to https://api.lobstermail.ai

***

### persistToken?

> `optional` **persistToken**: `boolean`

Defined in: packages/sdk/src/client.ts:16

Disable saving token to ~/.lobstermail/token. Default: true (save enabled).

***

### token?

> `optional` **token**: `string`

Defined in: packages/sdk/src/client.ts:10

API token. If not provided, resolved from env/file or auto-signup.
