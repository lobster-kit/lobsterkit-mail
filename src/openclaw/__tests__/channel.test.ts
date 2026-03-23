import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

// Mock openclaw SDK imports before importing our modules
vi.mock("openclaw/plugin-sdk/core", () => ({
  createChatChannelPlugin: vi.fn((opts: any) => opts),
  createChannelPluginBase: vi.fn((opts: any) => opts),
  defineChannelPluginEntry: vi.fn((opts: any) => opts),
  defineSetupPluginEntry: vi.fn((plugin: any) => ({ plugin })),
}));

vi.mock("openclaw/plugin-sdk/runtime-store", () => ({
  createPluginRuntimeStore: vi.fn(() => ({
    setRuntime: vi.fn(),
    getRuntime: vi.fn(),
    tryGetRuntime: vi.fn(),
  })),
}));

import { getChannelConfig } from "../channel.js";
import {
  parseInboundEmail,
  formatEmailForLLM,
  verifyWebhookSignature,
} from "../webhook.js";
import type { InboundEmailPayload } from "../webhook.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  channels: {
    lobstermail: {
      token: "lm_sk_test_abc123",
      inboxId: "ibx_001",
      inboxAddress: "agent@lobstermail.ai",
      allowFrom: ["user@example.com"],
      webhookSecret: "whsec_test",
    },
  },
};

const SAMPLE_PAYLOAD: InboundEmailPayload = {
  event: "email.received",
  webhookId: "wh_001",
  timestamp: "2026-03-23T10:30:00Z",
  email: {
    id: "em_001",
    from: "sender@example.com",
    to: ["agent@lobstermail.ai"],
    subject: "Hello Agent",
    body: {
      text: "Can you help me with something?",
      html: "<p>Can you help me?</p>",
    },
    receivedAt: "2026-03-23T10:30:00Z",
    security: {
      injectionRiskScore: 0.1,
      flags: [],
      spf: "pass",
      dkim: "pass",
      dmarc: "pass",
    },
  },
};

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

describe("getChannelConfig", () => {
  it("resolves a valid config", () => {
    const cfg = getChannelConfig(VALID_CONFIG as any);
    expect(cfg.token).toBe("lm_sk_test_abc123");
    expect(cfg.inboxId).toBe("ibx_001");
    expect(cfg.inboxAddress).toBe("agent@lobstermail.ai");
    expect(cfg.allowFrom).toEqual(["user@example.com"]);
  });

  it("throws when token is missing", () => {
    expect(() =>
      getChannelConfig({ channels: { lobstermail: {} } } as any),
    ).toThrow("missing `token`");
  });

  it("throws when inboxId is missing", () => {
    expect(() =>
      getChannelConfig({
        channels: { lobstermail: { token: "t" } },
      } as any),
    ).toThrow("missing `inboxId`");
  });

  it("throws when inboxAddress is missing", () => {
    expect(() =>
      getChannelConfig({
        channels: { lobstermail: { token: "t", inboxId: "i" } },
      } as any),
    ).toThrow("missing `inboxAddress`");
  });

  it("throws when channels.lobstermail is undefined", () => {
    expect(() => getChannelConfig({} as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// inspectAccount safety
// ---------------------------------------------------------------------------

describe("inspectAccount safety", () => {
  it("does not expose token or webhookSecret", () => {
    const cfg = getChannelConfig(VALID_CONFIG as any);
    const inspected = {
      id: cfg.inboxId,
      label: cfg.inboxAddress,
      details: {
        inboxId: cfg.inboxId,
        inboxAddress: cfg.inboxAddress,
        allowFrom: cfg.allowFrom ?? ["*"],
      },
    };

    const serialized = JSON.stringify(inspected);
    expect(serialized).not.toContain("lm_sk_test_abc123");
    expect(serialized).not.toContain("whsec_test");
  });
});

// ---------------------------------------------------------------------------
// Webhook parsing
// ---------------------------------------------------------------------------

describe("parseInboundEmail", () => {
  it("extracts fields from a valid payload", () => {
    const parsed = parseInboundEmail(SAMPLE_PAYLOAD);
    expect(parsed.id).toBe("em_001");
    expect(parsed.from).toBe("sender@example.com");
    expect(parsed.to).toEqual(["agent@lobstermail.ai"]);
    expect(parsed.subject).toBe("Hello Agent");
    expect(parsed.textBody).toBe("Can you help me with something?");
    expect(parsed.injectionRiskScore).toBe(0.1);
  });

  it("falls back to empty string when text body is missing", () => {
    const payload: InboundEmailPayload = {
      ...SAMPLE_PAYLOAD,
      email: {
        ...SAMPLE_PAYLOAD.email,
        body: { html: "<p>html only</p>" },
      },
    };
    const parsed = parseInboundEmail(payload);
    expect(parsed.textBody).toBe("");
  });

  it("defaults injectionRiskScore to 0 when security is absent", () => {
    const payload: InboundEmailPayload = {
      ...SAMPLE_PAYLOAD,
      email: {
        ...SAMPLE_PAYLOAD.email,
        security: undefined,
      },
    };
    const parsed = parseInboundEmail(payload);
    expect(parsed.injectionRiskScore).toBe(0);
    expect(parsed.securityFlags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LLM-safe formatting
// ---------------------------------------------------------------------------

describe("formatEmailForLLM", () => {
  it("wraps body in boundary markers", () => {
    const parsed = parseInboundEmail(SAMPLE_PAYLOAD);
    const safe = formatEmailForLLM(parsed);

    expect(safe).toContain("--- BEGIN UNTRUSTED EMAIL DATA ---");
    expect(safe).toContain("--- END UNTRUSTED EMAIL DATA ---");
    expect(safe).toContain("[EMAIL_CONTENT_START]");
    expect(safe).toContain("[EMAIL_CONTENT_END]");
    expect(safe).toContain("From: sender@example.com");
    expect(safe).toContain("Subject: Hello Agent");
    expect(safe).toContain("Can you help me with something?");
  });

  it("places metadata outside the content boundary", () => {
    const parsed = parseInboundEmail(SAMPLE_PAYLOAD);
    const safe = formatEmailForLLM(parsed);
    const lines = safe.split("\n");

    const contentStart = lines.indexOf("[EMAIL_CONTENT_START]");
    const fromIdx = lines.findIndex((l) => l.startsWith("From:"));
    const subjectIdx = lines.findIndex((l) => l.startsWith("Subject:"));

    expect(fromIdx).toBeLessThan(contentStart);
    expect(subjectIdx).toBeLessThan(contentStart);
  });
});

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature", () => {
  const secret = "whsec_test_secret";
  const body = '{"event":"email.received"}';
  const validSig = createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid HMAC signature", () => {
    expect(verifyWebhookSignature(body, validSig, secret)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(verifyWebhookSignature(body, "bad_sig", secret)).toBe(false);
  });

  it("skips verification when no secret is configured", () => {
    expect(verifyWebhookSignature(body, undefined, undefined)).toBe(true);
  });

  it("rejects when secret is set but signature is missing", () => {
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
  });
});
