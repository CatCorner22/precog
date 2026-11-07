import type { BetterAuthPlugin } from "better-auth";
import { GROK_PROVIDERS } from "./providers";

/** Keep the broker's registered 1.6 callback URLs while using the 1.7 social API. */
export function brokerCallbacks(): BetterAuthPlugin {
  const providers = new Set(GROK_PROVIDERS.map(({ providerId }) => providerId));
  const legacyRedirect = (uri: string) =>
    uri.replace("/api/auth/callback/", "/api/auth/oauth2/callback/");
  return {
    id: "broker-callbacks",
    init(ctx) {
      for (const provider of ctx.socialProviders) {
        if (!providers.has(provider.id)) continue;
        const authorize = provider.createAuthorizationURL.bind(provider);
        const exchange = provider.validateAuthorizationCode.bind(provider);
        provider.createAuthorizationURL = (data) =>
          authorize({ ...data, redirectURI: legacyRedirect(data.redirectURI) });
        provider.validateAuthorizationCode = (data) =>
          exchange({ ...data, redirectURI: legacyRedirect(data.redirectURI) });
      }
    },
    async onRequest(request) {
      const url = new URL(request.url);
      const match = /^\/api\/auth\/oauth2\/callback\/([^/]+)$/.exec(url.pathname);
      if (!match || !providers.has(match[1])) return;
      url.pathname = `/api/auth/callback/${match[1]}`;
      return { request: new Request(url, request) };
    },
  };
}
