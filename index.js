// agent-code-guard: stop specific agents from touching code/config directly,
// nudge them to delegate to named coding agents instead. Plain JS, no SDK
// import required - the loader only checks that `register` is a function.
import { normalizeConfig } from "./src/config.js";
import { evaluateGuard } from "./src/policy.js";

function pluginConfigSchema() {
  return {
    safeParse(value) {
      if (value === undefined) return { success: true, data: undefined };
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { success: false, error: { message: "expected config object" } };
      }
      return { success: true, data: value };
    },
  };
}

const agentCodeGuardPlugin = {
  id: "agent-code-guard",
  name: "agent-code-guard",
  description:
    "Blocks named agents from directly writing/editing code or config, pushing them to delegate instead.",
  configSchema: pluginConfigSchema(),
  register(api) {
    api.registerTrustedToolPolicy({
      id: "agent-code-guard-policy",
      description:
        "Configured agents must delegate code/config changes to named coding agents instead of touching them directly.",
      evaluate(event, ctx) {
        const cfg = normalizeConfig(api.pluginConfig);
        return evaluateGuard(cfg, event, ctx, (entry) => {
          // audit mode: never blocks, just logs what would have been blocked.
          const log = api.logger?.warn ?? console.warn;
          log(`[agent-code-guard][audit] would block ${entry.toolName} target=${entry.target} rule=${entry.ruleLabel} agent=${entry.agentId}`);
        });
      },
    });
  },
};

export default agentCodeGuardPlugin;
