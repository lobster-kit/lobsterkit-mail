import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { lobstermailPlugin } from "./channel.js";
import { store } from "./runtime.js";
import {
  parseInboundEmail,
  formatEmailForLLM,
  verifyWebhookSignature,
} from "./webhook.js";
import type { InboundEmailPayload } from "./webhook.js";

export default defineChannelPluginEntry({
  id: "lobstermail",
  name: "LobsterMail",
  description: "Email for AI agents via LobsterMail",
  plugin: lobstermailPlugin,
  setRuntime: store.setRuntime,

  registerFull(api) {
    // -- Inbound email webhook -----------------------------------------------
    api.registerHttpRoute({
      path: "/lobstermail/webhook",
      auth: "plugin",
      handler: async (req, res) => {
        const cfg = api.config;
        const channelConfig = (cfg as Record<string, any>).channels
          ?.lobstermail;

        // Signature verification
        const rawBody =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        const signature = req.headers["x-lobstermail-signature"] as
          | string
          | undefined;

        if (
          !verifyWebhookSignature(
            rawBody,
            signature,
            channelConfig?.webhookSecret,
          )
        ) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: "Invalid webhook signature" }));
          return true;
        }

        // Parse and dispatch
        let payload: InboundEmailPayload;
        try {
          payload = (
            typeof req.body === "string" ? JSON.parse(req.body) : req.body
          ) as InboundEmailPayload;
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Malformed JSON body" }));
          return true;
        }
        const email = parseInboundEmail(payload);
        const safeContent = formatEmailForLLM(email);

        api.logger.info(
          `Inbound email from ${email.from}: ${email.subject}`,
        );

        // Inbound dispatch: channel-specific and depends on the OpenClaw
        // runtime inbound pipeline wiring. The webhook correctly receives,
        // verifies, and parses emails. Dispatch to agent sessions will be
        // completed when we integrate with a live OpenClaw gateway instance
        // to confirm the exact runtime API (see bundled channel plugins
        // like extensions/msteams or extensions/googlechat for patterns).

        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return true;
      },
    });

    // -- CLI subcommand -------------------------------------------------------
    api.registerCli(
      ({ program }) => {
        program
          .command("lobstermail")
          .description("LobsterMail email channel management");
      },
      { commands: ["lobstermail"] },
    );
  },
});

export { lobstermailPlugin } from "./channel.js";
export { store } from "./runtime.js";
export type { LobsterMailChannelConfig } from "./channel.js";
export type { InboundEmailPayload, ParsedInboundEmail } from "./webhook.js";
