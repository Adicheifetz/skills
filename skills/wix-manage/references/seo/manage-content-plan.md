---
name: "Generate and Read a Wix Site's Content Plan"
description: "Generate an SEO content plan for a Wix site, read suggested blog post topics and keywords, and diagnose a generation flow that appears stuck."
---

# Generate and Read a Wix Site's Content Plan

A content plan contains suggested blog post briefs, not published posts.
`contentPlanFlowId` identifies the generation job, not the site.

**Verified public path:** a live trigger completed automatically and returned
21 same-flow candidates without Create Content Plan. A premature Create Content
Plan call in another run returned HTTP `428`.
These observations provide no completion-time guarantee and do not verify
recovery of a genuinely parked flow.

Use the selected site's authorization context. Writes require **Manage SEO
Settings**; execute them when the user requests the change or confirms it. Never
change business data or publication state just to accelerate generation.
Substitute actual returned IDs for example placeholders before executing calls.
If a request tool needs `siteId`, copy the actual selected or supplied site ID;
never derive it from `contentPlanFlowId`.
The `/seo-content-plan-service/v1` paths below match the linked official REST
references. Trigger, status, candidate and research reads were also verified
through Wix's official API Playground; the keyword-edit example matches its
linked method schema. These replace the older `/promote/seo/v1` aliases.

## 1. Trigger or inspect an existing flow

For new generation, trigger once:

```
POST https://www.wixapis.com/seo-content-plan-service/v1/content-plan-flows/trigger
{}
```

Response: `{ "contentPlanFlowId": "<flow-uuid>" }`. Save the actual ID.
[Trigger Content Plan Generation Flow](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-content-plan-flow-v1/trigger-content-plan-generation-flow).

For an existing flow, obtain its actual ID from the conversation or a prior
response. **If missing, ask for it before any API call and end the turn.** Do not
substitute the site ID, guess an ID or trigger a replacement. Preserve the actual
flow ID, last observed status and any known release history for later resume.

## 2. Read status with bounded waiting

```
GET https://www.wixapis.com/seo-content-plan-service/v1/content-plan-flows/{contentPlanFlowId}
```

Read nested `contentPlanFlow.status`. Example:

```json
{
  "contentPlanFlow": {
    "id": "<flow-uuid>",
    "status": "KEYWORD_RESEARCH",
    "keywordResearchId": "<research-uuid>"
  }
}
```

The first check needs no pause. For subsequent checks, use supported pauses of
about 15 seconds to avoid hammering an API that provides no ETA. This is a client
recommendation, not an API rate limit or measured completion time. Before
monitoring, use an available clock to choose and note a finite end time suited
to the user and supported waiting window. Stop at that time; do not silently extend it.

**Each execution makes one HTTP request and returns.** Use a supported external
wait or one bounded delay before a single status GET. Never put multiple requests
in a polling loop, busy-wait, or use API/doc calls as a substitute for a pause.
Request counts and frozen `updatedAt` values do not measure elapsed time.

If a usable clock or supported waiting is unavailable, or the window ends, report
incomplete with the saved ID, status and release history. Expiry does not prove
failure. End the turn for a later requested resume; do not restart automatically.

| Observed status | Action |
| --- | --- |
| `CREATED`, `SITE_ANALYSIS`, `SITE_SUMMARY` | Continue paced checks within the window. |
| `KEYWORD_RESEARCH` | Continue paced checks for possible automatic progress; see [keyword-stage troubleshooting](#a-flow-remains-at-keyword_research) before considering release. |
| `CONTENT_PLAN` | Continue paced checks; skip release. |
| `SUCCESS` | Stop waiting and read candidates. |
| `PENDING_REQUIREMENTS` | Stop; report the actual unmet requirement. Never invent site data. |
| `FAIL`, `CANCELED` | Report the actual ID and result, then stop. |
| Missing or unrecognized status | Report uncertainty; do not silently poll. |

[Get Content Plan Flow](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-content-plan-flow-v1/get-content-plan-flow).

## 3. Read and present actual briefs

Only after observing `SUCCESS` for the same flow:

```
GET https://www.wixapis.com/seo-content-plan-service/v1/content-plan-flows/{contentPlanFlowId}/blog-post-candidates
```

Omit `paging` to return all candidates. Read titles and keywords from `briefData`:

```json
{
  "blogPostCandidates": [{
    "id": "<candidate-id>",
    "briefData": {
      "h1Title": "How to Care for Handmade Ceramic Mugs",
      "keyword": "ceramic mug care",
      "mainKeyword": "handmade ceramic mugs",
      "pageUrl": "https://www.example.com/mugs"
    }
  }],
  "pagingMetadata": { "count": 1, "hasNext": false }
}
```

The final reply must give the actual flow ID, observed completion and count,
followed by a table with **Title | Keyword | Main keyword | Supporting URL**.
Populate all four columns from `briefData`, with clickable supporting URLs;
a titles-only or titles/main-keywords table is incomplete. Label any shortened subset.
Absent fields are unavailable; do not invent them. `pageUrl` supports an existing
page, not a newly published post. Explain weak or repetitive results honestly;
successful generation does not establish editorial quality or promise rankings.
[List Blog Post Candidates](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-blog-post-candidate-v1/list-blog-post-candidates).

## A flow remains at KEYWORD_RESEARCH

If the actual flow ID was not supplied, explicitly ask the user to send
`contentPlanFlowId` in your first reply, before any API call. Merely telling them
to "use the same ID" is not a request for the missing ID. Briefly explain the
diagnostic limit below, then end the turn until the ID arrives.

Research may still be running or may await another action. Status and elapsed
time alone prove neither readiness nor failure. Obtain the actual ID first, then
read its status; skip release if it has advanced to `CONTENT_PLAN` or `SUCCESS`.
New generation can still progress automatically: continue its bounded status
checks rather than treating this stage alone as a failed or parked flow.

The documented `POST https://www.wixapis.com/seo-content-plan-service/v1/create-content-plan`
requires the flow's matching keyword research to have status `SUCCESS`. It belongs
to Blog Post Candidate, distinct from the Content Plan Flow being polled.
[Create Content Plan](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-blog-post-candidate-v1/create-content-plan).

**Do not call Create Content Plan to recover a flow reported stuck at
`KEYWORD_RESEARCH` through this recipe.** The documented prerequisite is matching
research `SUCCESS`, but no public research-status read is provided here. The
keyword-items list is a post-completion, site-scoped read; its items cannot prove
that prerequisite. Report the actual flow ID/status and the missing public
readiness capability, then stop the recovery attempt without a mutation.

This is a concrete diagnostic limit, not an instruction to search for an unnamed
recovery method. Do not call private endpoints, release to test readiness, or
trigger a replacement. Bounded status monitoring for possible automatic progress
remains valid; a monitoring timeout alone proves neither a stall nor failure.
If a previous release returned HTTP `428`, inspect its error and make a paced
status check, without retrying the POST. Stop on actual cancellation. A successful
release response by itself would not prove completion; never claim a different
returned flow completed the original.

## Editing keywords after completion (optional)

After observed flow `SUCCESS`, read research once:

```
GET https://www.wixapis.com/seo-content-plan-service/v1/content-plan-keyword-research-items
```

No parameters are required; omit optional `paging` for all items. Match returned
`keywordResearchId` to the completed flow and use actual `keywordResearchItems`
item IDs before editing. A mismatch or HTTP `404` is not permission to edit or
retry immediately. This is a post-completion read, not a pre-completion readiness
test.
The list is site-scoped and returns the latest research, not per-research status.
Its reserved `contentPlanFlowId` query field is ignored; it cannot target an older
flow or prove that flow's readiness.
[List Keyword Research Items](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-keyword-research-v1/list-keyword-research-items).

Only `keyword` and `mainKeyword` are writable, using a field mask.
`mainKeyword: true` promotes an existing item; false does not demote it.
[Update Keyword Research Item](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-keyword-research-v1/update-keyword-research-item).

```
PATCH https://www.wixapis.com/seo-content-plan-service/v1/keyword-research-items/{itemId}
{
  "keywordResearchId": "<research-uuid>",
  "item": { "id": "<item-id>", "keyword": "new keyword" },
  "fieldMask": "keyword"
}
```

The copy-on-write response can return a new `keywordResearchId`; use it for the
next write. Edits do not persist across generations.
