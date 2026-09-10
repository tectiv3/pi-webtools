/**
 * Extract headings and readable body text from a parsed website document.
 */

import { Readability } from "@mozilla/readability"

import { htmlToMarkdown, htmlToText, normalizeText } from "../text"

import { parseHtml } from "./parse-html"

import type { ContentFormat } from "../config"
import type { JSDOM } from "jsdom"

/**
 * Empty headings record used when jsdom cannot parse the input at all.
 */
const EMPTY_HEADINGS: PageHeadings = { title: "", h1: "", h2: "" }

/**
 * Structured extraction of the core heading fields on a page.
 */
interface PageHeadings {
  /** Contents of the `<title>` element, or an empty string when absent. */
  title: string
  /** Text of the first `<h1>` element, or an empty string when absent. */
  h1: string
  /** Text of the first `<h2>` element, or an empty string when absent. */
  h2: string
}

/**
 * Combined headings + full readable content for an HTML page, produced by a single jsdom parse.
 */
export interface HtmlPageContent {
  /** Extracted heading fields (title and first h1/h2); empty strings when unparseable. */
  headings: PageHeadings
  /** Full extracted readable content, formatted into the requested shape but not truncated. */
  content: string
}

/**
 * Extract headings and the full readable content from an HTML page in a single jsdom parse.
 * Headings are read before Mozilla Readability is invoked because Readability mutates its input
 * document, stripping the chrome (nav, sidebars) that might otherwise hide a page's `<title>` or
 * leading `<h1>` from later queries. The returned content is the complete extracted text; bounding
 * it to a character budget is the retrieval layer's concern.
 *
 * @param html - Raw HTML payload.
 * @param url - Absolute URL of the page, used by Readability to resolve relative references.
 * @param format - Output format applied to the extracted content.
 * @returns The combined headings and full content for the page.
 */
export function extractHtmlPage(html: string, url: string, format: ContentFormat): HtmlPageContent {
  const dom = buildDom(html, url)

  if (dom === undefined) {
    return { headings: EMPTY_HEADINGS, content: html }
  }

  return { headings: extractHeadingsFromDom(dom), content: extractVisibleText(dom, format) }
}

/**
 * Parse HTML into a jsdom instance carrying the absolute URL for relative-reference resolution,
 * returning `undefined` when jsdom cannot construct the DOM.
 *
 * @param html - Raw HTML payload.
 * @param url - Absolute URL of the page.
 * @returns The constructed jsdom instance, or `undefined` on parse failure.
 */
function buildDom(html: string, url: string): JSDOM | undefined {
  try {
    return parseHtml(html, { url })
  } catch {
    return undefined
  }
}

/**
 * Extract the document title and the first h1/h2 from a jsdom document.
 *
 * @param dom - Jsdom instance wrapping the parsed HTML document.
 * @returns The extracted heading fields, each empty when the corresponding element is missing.
 */
function extractHeadingsFromDom(dom: JSDOM): PageHeadings {
  const { document } = dom.window

  return {
    title: normalizeText(document.querySelector("title")?.textContent),
    h1: normalizeText(document.querySelector("h1")?.textContent),
    h2: normalizeText(document.querySelector("h2")?.textContent),
  }
}

/**
 * Extract the main readable content via Mozilla Readability, falling back to the body's inner
 * HTML when Readability can't identify an article.
 *
 * @param dom - Jsdom instance wrapping the parsed HTML document.
 * @param format - Output format applied to the extracted content.
 * @returns The extracted content, formatted into the requested output shape.
 */
function extractVisibleText(dom: JSDOM, format: ContentFormat): string {
  const articleContent = runReadability(dom)

  if (articleContent !== undefined && articleContent !== "") {
    return formatHtml(articleContent, format)
  }

  return formatHtml(dom.window.document.body.innerHTML, format)
}

/**
 * Run Mozilla Readability against the supplied document, returning its extracted article
 * HTML or `undefined` when Readability throws or finds nothing.
 *
 * @param dom - Jsdom instance whose document Readability will parse and mutate in place.
 * @returns The article HTML, or `undefined` when extraction fails.
 */
function runReadability(dom: JSDOM): string | undefined {
  try {
    return new Readability(dom.window.document).parse()?.content ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Convert an HTML fragment to the requested output format.
 *
 * @param htmlFragment - HTML to convert.
 * @param format - Target output format.
 * @returns The formatted content string.
 */
function formatHtml(htmlFragment: string, format: ContentFormat): string {
  return format === "markdown" ? htmlToMarkdown(htmlFragment) : htmlToText(htmlFragment)
}
