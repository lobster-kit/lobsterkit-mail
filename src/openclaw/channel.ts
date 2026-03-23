import {
  createChatChannelPlugin,
  createChannelPluginBase,
} from "openclaw/plugin-sdk/core";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { LobsterMail } from "../client.js";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export interface LobsterMailChannelConfig {
  token: string;
  inboxId: string;
  inboxAddress: string;
  allowFrom?: string[];
  webhookSecret?: string;
  dmSecurity?: string;
}

export function getChannelConfig(
  ocConfig: OpenClawConfig,
): LobsterMailChannelConfig {
  const cfg = (ocConfig as Record<string, any>).channels?.lobstermail;
  if (!cfg?.token) throw new Error("lobstermail: missing `token` in config");
  if (!cfg?.inboxId)
    throw new Error("lobstermail: missing `inboxId` in config");
  if (!cfg?.inboxAddress)
    throw new Error("lobstermail: missing `inboxAddress` in config");
  return cfg as LobsterMailChannelConfig;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const lobstermailPlugin = createChatChannelPlugin({
  base: createChannelPluginBase({
    id: "lobstermail",

    setup: {
      resolveAccount(ocConfig: OpenClawConfig) {
        const cfg = getChannelConfig(ocConfig);
        return {
          id: cfg.inboxId,
          label: cfg.inboxAddress,
        };
      },

      inspectAccount(ocConfig: OpenClawConfig) {
        const cfg = getChannelConfig(ocConfig);
        return {
          id: cfg.inboxId,
          label: cfg.inboxAddress,
          details: {
            inboxId: cfg.inboxId,
            inboxAddress: cfg.inboxAddress,
            allowFrom: cfg.allowFrom ?? ["*"],
            // token and webhookSecret intentionally excluded
          },
        };
      },
    },
  }),

  security: {
    dm: {
      policy: "allowlist",
      resolveAllowFrom(ocConfig: OpenClawConfig) {
        const cfg = getChannelConfig(ocConfig);
        return cfg.allowFrom ?? ["*"];
      },
    },
  },

  pairing: {
    text: {
      parseIdentifier(text: string) {
        const trimmed = text.trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return { identifier: trimmed };
        }
        return null;
      },
    },
  },

  threading: {
    topLevelReplyToMode: "reply",
  },

  outbound: {
    attachedResults: {
      async sendText({ config, to, text, subject }) {
        const cfg = getChannelConfig(config);
        const lm = await LobsterMail.create({
          token: cfg.token,
          autoSignup: false,
          persistToken: false,
        });

        // Use getInbox(id) — single API call, not listInboxes()
        const inbox = await lm.getInbox(cfg.inboxId);

        const result = await inbox.send({
          to: Array.isArray(to) ? to : [to],
          subject: subject ?? "Message from your AI agent",
          body: { text },
        });

        return { messageId: result.id };
      },
    },
  },
});
