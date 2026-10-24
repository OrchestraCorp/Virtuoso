/** Endpoint spelling shared by Anthropic model requests and model discovery. */

/**
 * Resolve the root expected by Anthropic SDKs that append `/v1` resources.
 * Deployment prefixes are preserved; one trailing version segment is removed.
 * @param baseURL - configured API root, optionally ending in `/v1`.
 * @returns the API root without trailing slashes or one trailing `/v1`.
 */
export function anthropicApiRoot(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '')
  return base.endsWith('/v1') ? base.slice(0, -3) : base
}
