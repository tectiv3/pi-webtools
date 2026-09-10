/**
 * TypeBox URL schema restricted to fetchable http(s) origins.
 */

import { Type } from "typebox"

/**
 * TypeBox schema that accepts a URL string whose protocol is `http` or `https`.
 * Rejects `file://`, `javascript:`, `data:`, and other non-fetchable schemes at
 * the tool boundary instead of deferring the rejection to the fetch layer.
 */
export const httpUrlSchema = Type.String({ pattern: /^https?:\/\//i, description: "A URL with an http or https protocol." })
