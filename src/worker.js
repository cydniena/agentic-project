import { Container, getContainer } from "@cloudflare/containers";

/**
 * Fronts the Express app running in the container. Every request is forwarded to
 * the same instance, because the reply queue and the brand profile are held on
 * that container's local disk - routing to a second instance would show a
 * different session's state.
 */
export class BrandVoiceContainer extends Container {
  defaultPort = 3000;

  // Spins down after a quiet period. Local disk does NOT survive that, so the
  // queue and any saved brand profile reset on the next wake. The brand voice
  // skill itself is baked into the image and is unaffected.
  sleepAfter = "20m";

  // Secrets reach the container as environment variables, the same names the
  // app already reads from .env.
  envVars = {
    LLM_PROVIDER: this.env.LLM_PROVIDER ?? "openai",
    LLM_BASE_URL: this.env.LLM_BASE_URL ?? "https://opencode.ai/zen/go/v1",
    LLM_MODEL: this.env.LLM_MODEL ?? "deepseek-v4-flash",
    LLM_API_KEY: this.env.LLM_API_KEY ?? "",
  };
}

export default {
  async fetch(request, env) {
    return getContainer(env.CONTAINER).fetch(request);
  },
};
