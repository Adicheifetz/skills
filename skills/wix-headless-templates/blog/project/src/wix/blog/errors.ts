// A server page's answer to a blog read that threw. The readers never catch: an error propagates
// as the SDK threw it, and the page's catch hands it here. Copy as-is.
import { isNotFound } from "./posts-core";

/** 404 when the read threw because the item doesn't exist; else 500, logged. */
export function readFailureResponse(e: unknown, what: string): Response {
  if (isNotFound(e)) return new Response(null, { status: 404 });
  console.error(`${what} failed to load`, e);
  return new Response(null, { status: 500 });
}
