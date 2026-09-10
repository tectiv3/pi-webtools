/**
 * Construct jsdom instances with CSS-parse and resource noise suppressed.
 */

import { JSDOM, VirtualConsole, type ConstructorOptions } from "jsdom"

/**
 * Shared virtual console that drops jsdom's `jsdomError` events. With no listener attached,
 * jsdom dumps these to `console.error`, surfacing real-world pages' unparseable CSS ("Could
 * not parse CSS stylesheet") and not-implemented notices as plugin-process stderr noise. The
 * plugin never executes page scripts or loads subresources, so the events carry nothing
 * actionable, and a no-op listener suppresses the default console fallback.
 */
const quietVirtualConsole = new VirtualConsole().on("jsdomError", () => {
  /* Swallow jsdom errors so they never reach the plugin-process console. */
})

/**
 * Parse an HTML payload into a jsdom instance using the shared quiet virtual console.
 *
 * @param html - Raw HTML payload.
 * @param options - Optional jsdom construction options, such as the page `url` for relative-reference resolution.
 * @returns The constructed jsdom instance.
 */
export function parseHtml(html: string, options?: ConstructorOptions): JSDOM {
  return new JSDOM(html, { ...options, virtualConsole: quietVirtualConsole })
}
