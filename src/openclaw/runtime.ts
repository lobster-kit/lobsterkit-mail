import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";

export const store = createPluginRuntimeStore<PluginRuntime>(
  "lobstermail plugin runtime not initialized",
);
