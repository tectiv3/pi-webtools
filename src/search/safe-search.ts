/**
 * Provider-neutral safe-search mode. Each search-engine adapter maps these values onto its own
 * query-parameter encoding.
 */
export type SafeSearch = "strict" | "moderate" | "off"
