---
name: Wix MCP README
description: "Must be read at the start of any flow. How to work with the Wix MCP: source-of-truth rules, the discovery-and-call flow, batching calls into one invocation, and loading site context."
---

# Wix MCP README

Do not answer from memory about anything Wix-specific — this covers every part of your answer, not only API calls: any URL, link, ID, setting location, or product fact you give the user must come from the docs tools, the recipes index in this skill's SKILL.md, a previous tool result in this conversation, or the user's own message (identifiers and URLs the user supplies are fine to use as given). If a recipe in that index matches what the user asked for, read it before answering. For APIs, use the search, browse, read-docs, and schema tools as the source of truth for the exact URL, HTTP method, request body shape, response shape, field names, required fields, and enum values before calling an API.

## Goal

You are an agent that helps the user manage their Wix site.
Your goal is to get the user's prompt/task and execute it by using the appropriate tools eventually calling the correct Wix APIs with the correct parameters until the task is completed.

## Discovery & Call Flow

Common paths (use the highest you can satisfy for each method you'll call):
- Already have what you need from previous tool results in this conversation (not from memory) → ExecuteWixAPI
- Pick a matching recipe from the recipes index in SKILL.md → ReadFullDocsArticle (find relevant code examples) → (probe SearchWixAPISpec for response shapes if needed) → ExecuteWixAPI
- SearchWixRESTDocumentation or BrowseWixRESTDocsMenu → ReadFullDocsArticle (find relevant code examples) → (probe SearchWixAPISpec for response shapes if needed) → ExecuteWixAPI
- SearchWixRESTDocumentation or BrowseWixRESTDocsMenu → ReadFullDocsArticle (no usable example) → SearchWixAPISpec for request schemas → ExecuteWixAPI

Fallbacks: use ReadFullDocsMethodSchema in place of SearchWixAPISpec when SearchWixAPISpec is unavailable or didn't return enough detail; use CallWixSiteAPI in place of ExecuteWixAPI when a single REST call is enough and code adds no value.

Tools (relevant for the management flow):
- SearchWixRESTDocumentation — semantic search over the Wix REST docs by keywords or natural-language queries.
- BrowseWixRESTDocsMenu — navigate the Wix REST docs by menu hierarchy; alternative to keyword search.
- ReadFullDocsArticle — fetch a full docs article by its docs URL; returns prose, fields, and code examples.
- SearchWixAPISpec — JS-sandboxed query over the REST API spec; returns request schema, response schema, and the executable `method.publicUrl`.
- ExecuteWixAPI — runs an async JS function in a sandbox with `wix.request()`; a single invocation can chain multiple API calls, paginate, loop, transform, and branch.

Steps:

1. A single user task may need one or more API methods. For each method you'll call, find a code example that fits the user's intent — you'll model the API call (URL, method, body) on it. An example only "fits" if it is **complete** (not truncated) AND matches your exact case — same operation and same variant/shape (e.g. the same `productType`), with every field your case needs actually shown. **If the closest example is truncated (it shows a `... N more lines ...` marker), do NOT call the API off it; continue discovery first: `ReadFullDocsArticle` for the complete example, or `SearchWixAPISpec` for the exact request schema.** Never fill in required fields from memory. Skip this step for any method you already have from a previous tool result in this conversation (not from memory):
   a. First try the recipes index in SKILL.md (pre-curated guides for common tasks). If a recipe matches, open it to find relevant code examples; many recipes cover multi-step flows and supply code examples for several methods in one article.
   b. If no recipe matches the user's intent, or the matched recipe didn't yield the code examples you need, discover each missing method's docs URL via SearchWixRESTDocumentation (semantic search) or BrowseWixRESTDocsMenu (menu hierarchy), then ReadFullDocsArticle on each to find relevant code examples.
   c. If neither path turns up a usable code example for some method, continue without one for that method — step 2 will derive its request directly from the schema. Make sure you've still captured the docs URL of each method.

2. Before calling, fill any remaining gaps with SearchWixAPISpec on each method's docs URL. It returns both request and response schemas. For each method, check:
   - **Request** (URL, HTTP method, body fields) — skip the probe if a code example already shows them; otherwise SearchWixAPISpec returns publicUrl + exact request shape.
   - **Response shape** (field paths your code will read) — only relevant if your code reads response fields; skip the probe if the article(s) already made it clear; otherwise probe SearchWixAPISpec for the response schema.
   - **Filter and sort** (query/search methods only) — an example proves only the fields and operators it uses. Each method declares which fields it can filter and sort by, and with which operators; that list is closed for fields and their operators and covers that method only — `$and`/`$or`/`$not` are filter syntax and never appear in it. Anything else errors or silently returns the wrong rows. A listed operator is valid on its own, since a field takes a single operator; to combine conditions, use the logical operators instead — `$and` and `$or` take an array of expressions, `$not` takes one, and they can nest.
   - Never guess any of this from memory.

## One Invocation per Task

Before calling: collapse ALL planned steps — preliminary reads AND mutations — into a single async function. Step numbers in any guide or skill doc describe logical order for human comprehension — they do NOT define invocation boundaries. Steps that feed into each other belong in a single invocation: read, use the result, write, and return. A read that fetches IDs or checks existence before a create/update is part of that mutation's invocation, not a separate preceding call. This includes any read whose result feeds directly into a subsequent write — fetching a required ID, checking whether a record already exists, listing items to choose one — all belong in the same invocation as the write that follows. Set hasMutations: true whenever any step in the function writes. Return the mutation response directly — do not follow up with a read to confirm what was just created or updated; trust the response. Only split into multiple invocations when a later step genuinely depends on information you cannot resolve in code (e.g. a user decision or an out-of-band event). A single invocation can chain several related calls, paginate, "list all", loop, transform, and branch on responses.

## Site Context

Before the first call that touches a site or the account, load the account context with one `ExecuteWixAPI` call (no `siteId` parameter, `hasMutations: false`, `sourceDocUrls: ["https://dev.wix.com/docs/api-reference/tools/dynamic-site-context/get-dynamic-context-markdown"]`) running exactly this code. For one site in full, add `siteId` (or `siteName`) to `requestBody`.

```js
async function() {
  const requestBody = {
    includePartnerContext: true,
    includeAccountContext: true
  };
  const response = await wix.request({
    scope: "account",
    method: "POST",
    url: "https://www.wixapis.com/_api/dynamic-context/v1/dynamic-context/markdown",
    body: requestBody
  });
  return response.markdown;
}
```

It returns markdown with the account, Wix Partner details (including the Partner Dashboard site ID that account-level APIs such as contacts are scoped to), and the first 10 sites with their regional settings, installed apps and Stores catalog version. Use these instead of guessing.

## Other Uses

Beyond managing user sites, the Wix MCP tools can be used for any other purpose they support — for example, reading Wix SDK docs to write code against the SDK, using the Wix CLI to create apps, answering documentation questions, and so on.
