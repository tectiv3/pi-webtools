/**
 * Shared TypeBox schema describing the `page` parameter accepted by the Web Search tool.
 */

import { Type } from "typebox"

/**
 * Lower bound on the requested page number.
 */
export const MIN_PAGE_NUMBER = 1

/**
 * Upper bound on the requested page number.
 */
export const MAX_PAGE_NUMBER = 100

/**
 * Default page number when the caller omits the parameter.
 */
export const DEFAULT_PAGE_NUMBER = 1

/**
 * Reusable TypeBox schema applied to the `page` parameter of the search tools; bounds the value
 * to a one-based page number within the engine's practical pagination range.
 */
export const searchPageParameter = Type.Optional(
  Type.Number({
    minimum: MIN_PAGE_NUMBER,
    maximum: MAX_PAGE_NUMBER,
    description: "The current page number for pagination.",
  })
)
