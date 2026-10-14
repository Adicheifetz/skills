---
name: "Generate and Read a Wix Site's Content Plan"
description: "Generate an SEO content plan for a Wix site, read suggested blog post topics and keywords, or continue a paused generation flow."
---

# Generate and Read a Wix Site's Content Plan

A content plan contains suggested blog post briefs, not published posts.
`contentPlanFlowId` identifies the generation job, not the site.

**Existing-flow entry gate:** without that job's actual `contentPlanFlowId`,
ask the user for it and end the turn after a concise diagnosis. Do not search
for a site-level fallback or make API calls to avoid asking. The site's latest
successful flow would not identify the user's parked job. Explain the next step:
with that ID, read the flow's `keywordResearchId`, use Get Site Keyword Research
to check that matching research's own status, and release once only after research
`SUCCESS` and a fresh matching `KEYWORD_RESEARCH` flow check. A retained REST call
to `GET https://www.wixapis.com/seo-content-plan-service/v1/content-plan-flows`
without an ID returned `404 Resource not found`; do not use it as ID discovery.

`KEYWORD_RESEARCH` means research has started, not finished. Read the matching
research's own status before releasing the flow. Some flows advance automatically;
`CONTENT_PLAN` or `SUCCESS` needs no release. Polling alone does not release a
flow that is waiting for Create Content Plan.

Use the selected site's authorization context. Writes require **Manage SEO
Settings**; execute them when the user requests the change or confirms it. Never
change business data or publication state just to accelerate generation.
Substitute actual returned IDs for example placeholders before executing calls.
If a request tool needs `siteId`, copy the actual selected or supplied site ID;
never derive it from `contentPlanFlowId`.
The `/seo-content-plan-service/v1` paths below match the linked official REST
references. The Endpoint section of the
[Trigger REST reference](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-content-plan-flow-v1/trigger-content-plan-generation-flow)
documents `POST https://www.wixapis.com/seo-content-plan-service/v1/content-plan-flows/trigger`.
The exact-ID Get Site Keyword Research read below was verified with Wix MCP's
public method schema: GET `/v1/site-keyword-research`, optional
`keywordResearchId` query, and `siteKeywordResearch` response. The schema's public
server mapping uses `https://www.wixapis.com/seo-content-plan-service`. This API
has no `/promote/seo/v1` alias in its mappings. Its docs-menu publication is still
pending; if unavailable in the caller's runtime, report the error without a
private fallback. List Keyword Research Items is a different method.

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
| `KEYWORD_RESEARCH` | Follow [Check research and release once](#3-check-research-and-release-once), within the same monitoring window. |
| `CONTENT_PLAN` | Continue paced checks; skip release. |
| `SUCCESS` | Stop waiting and read candidates. |
| `PENDING_REQUIREMENTS` | Stop; report the actual unmet requirement. Never invent site data. |
| `FAIL`, `CANCELED` | Report the actual ID and result, then stop. |
| Missing or unrecognized status | Report uncertainty; do not silently poll. |

[Get Content Plan Flow](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-content-plan-flow-v1/get-content-plan-flow).

## 3. Check research and release once

For an existing stuck flow, ask for its actual `contentPlanFlowId` before calls.
Explain that the flow status is not research readiness: Create Content Plan is
an action on Blog Post Candidate, distinct from the flow-status read. It requires
matching research `SUCCESS`; ten minutes at this stage proves neither readiness
nor failure. With the ID, inspect the flow and use its actual `keywordResearchId`.

If the flow supplies no `keywordResearchId`, report the missing readiness input
and stop; do not guess it. While the flow is `KEYWORD_RESEARCH`, read **that
research**, not latest research:

```
GET https://www.wixapis.com/seo-content-plan-service/v1/site-keyword-research?keywordResearchId={keywordResearchId}
```

Read `siteKeywordResearch.id`, `status` and `contentPlanFlowId`. Require its ID
and flow ID to match the actual flow being followed. Never omit the query ID:
the ID-less read selects latest successful research and cannot prove readiness
of this job. Keyword-list items are also not a research-status check.

| Research result | Action |
| --- | --- |
| Matching `IN_PROGRESS` | Use a supported pause and a separate single-request read within the existing window; do not release. |
| Matching `SUCCESS` | Re-read the same flow immediately before release and apply the guards below. |
| Briefly not found | The flow can link the ID before its research record exists. Retry a paced read within the window, then inspect the flow if it persists; do not release or restart. |
| `FAIL`, `CANCELED`, `REVERTED`, missing/unknown status, mismatched IDs | Stop and report the actual result; no release or replacement. |
| Method unavailable, authorization denied, or other error | Report the specific error and preserve the IDs; no private fallback or readiness guess. |

After matching research `SUCCESS`, a fresh flow read must still show
`KEYWORD_RESEARCH` with the same research ID. If it has advanced to
`CONTENT_PLAN` or `SUCCESS`, skip release and follow its status. A changed research
ID requires checking the new research; the old success cannot authorize it.

When the user requested generation or continuation, and no release has already
been attempted for this flow, call Create Content Plan **once**:

```
POST https://www.wixapis.com/seo-content-plan-service/v1/create-content-plan
{ "contentPlanFlowId": "<actual-flow-id>" }
```

Record the attempt before sending. Concurrent/repeated calls can duplicate plans.
If release history is uncertain, ask rather than send another POST. Check HTTP
status and response `success`; `false` requires reporting `message`, not claiming
completion. The Create reference lists `428 Failed Precondition`; a retained
premature call also returned 428. Inspect its actual error and
make a paced status recheck; do not retry the POST in a loop. Other errors or an
uncertain response require reporting the attempt, not repeating it.

On success, retain the returned `contentPlanFlowId` and monitor it with the same
bounded, single-request approach. A different returned ID is a separate flow;
explain that and never claim the original completed. Completion still requires
observed `SUCCESS` and actual candidates. Do not release an already successful
flow to recover it: that action regenerates a separate plan.
[Create Content Plan](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-blog-post-candidate-v1/create-content-plan).

## 4. Read and present actual briefs

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
