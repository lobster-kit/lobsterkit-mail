[**lobstermail**](../README.md)

***

[lobstermail](../README.md) / buildSafeBodyForLLM

# Function: buildSafeBodyForLLM()

> **buildSafeBodyForLLM**(`opts`): `string`

Defined in: packages/sdk/src/safety.ts:40

Format email content for safe LLM consumption.

Output format:
```
--- BEGIN UNTRUSTED EMAIL DATA ---
From: sender@example.com
Subject: Your code
Date: 2026-02-16T20:30:00Z
Injection Risk: low (0.1)

[EMAIL_CONTENT_START]
Your verification code is 847291.
[EMAIL_CONTENT_END]
--- END UNTRUSTED EMAIL DATA ---
```

## Parameters

### opts

[`SafeBodyOptions`](../interfaces/SafeBodyOptions.md)

## Returns

`string`
