---
name: "Generate and Read a Wix Site's Content Plan"
description: "Generate an SEO content plan for a Wix site, read its suggested blog post topics and keywords, and troubleshoot or resume an existing generation flow."
---

# Generate and Read a Wix Site's Content Plan

A content plan contains suggested blog post briefs: titles, keywords and existing
site pages they support. Generation creates briefs, not published posts.
`contentPlanFlowId` identifies the asynchronous job; it is not the site ID.

**Verified against live site runs:** one
triggered flow advanced to `CONTENT_PLAN` and then `SUCCESS` without a release;
reading that same flow returned 24 candidates. Another flow went from observed
`KEYWORD_RESEARCH` to `SUCCESS` on the next paced check without readiness or
release calls, also returning 24 candidates. In a separate run, Create Content
Plan attempted while research was still running returned HTTP `428`. These
observations establish the automatic-progress and not-ready branches, not a
completion-time guarantee. The API references accompany each request below.

`KEYWORD_RESEARCH` can mean research is running or done. Status alone does not
prove readiness. Create Content Plan is a fallback for a flow still in that
state with matching, nonempty research, never an unconditional next step.

Use the selected site's authorization context. Trigger and Create Content Plan
are writes requiring **Manage SEO Settings**; execute them when the user requests
generation or confirms the mutation. Do not change business data or publication
state to accelerate generation. Those are separate tasks requiring real user
information and authorization.

## Missing flow ID

For an existing flow, find its actual ID in the conversation or trigger/status
response. If missing, make no API call: ask for `contentPlanFlowId` and end the
turn. Never substitute a site ID, guess an ID, submit a placeholder or trigger a
replacement to avoid obtaining it.

For a user reporting a stuck `KEYWORD_RESEARCH` flow, also briefly explain:

- Research can be running or done; even ten minutes does not prove readiness.
- With the ID, check `GET https://www.wixapis.com/promote/seo/v1/content-plan-keyword-research-items`
  for nonempty items matching the flow's `keywordResearchId`.
- After a fresh status check still shows `KEYWORD_RESEARCH` with that research
  ID, release once using `POST https://www.wixapis.com/promote/seo/v1/create-content-plan`.
  This is the Blog Post Candidate service, not the Content Plan Flow service
  being polled. An early release can return `428`; recheck instead of retrying
  release in a loop.
- Follow the [bounded waiting policy](#waiting-without-losing-progress); if
  waiting cannot continue, preserve the actual ID and status, report incomplete
  and resume later.

Name both endpoints but do not write a placeholder-ID request. Cover this
substance concisely; no fixed reply order is required.

## Generate or resume

For a new plan, [trigger](#1-trigger) once and save the returned ID. For an
existing plan, obtain its actual ID as above and start with [status](#2-read-status).
Use separate executions throughout:

1. Check status using the waiting policy and the table below.
2. At `KEYWORD_RESEARCH`, follow [readiness](#3-check-research-readiness) and the
   conditional [release](#4-release-only-if-still-needed).
3. If `CONTENT_PLAN` or `SUCCESS` appears automatically, skip readiness/release
   immediately; do not wait for the chosen first-readiness time.
4. After observed `SUCCESS`, [read and present the actual briefs](#5-read-and-present-the-briefs).

## Waiting without losing progress

**One API execution makes one HTTP request and returns.** Use a date/time
capability and a documented bounded pause that yields without HTTP calls or busy
loops. `updatedAt` may stay frozen; HTTP timestamps and counts are not clocks.

1. Before waiting, note the attempt start, finite budget and status cadence in
   your working notes, not necessarily the final reply. Adjustable defaults are
   about 15 seconds between status checks and 30 minutes total monitoring; they
   are client limits, not SLAs or measured API durations. Choose reasonable first
   readiness and retry intervals from available caller capabilities before the
   attempt, leaving a first-check window within the budget. Never extend/reset it.
2. After each response, record actual flow/research IDs, last status and clock
   times for first `KEYWORD_RESEARCH`, last status check and last readiness check.
   The first status GET needs no prior check time; it still honors the deadline.
3. Before the next status GET, read current time with the same clock/units and
   compare with last check plus chosen cadence. If the needed wait reaches the
   deadline, stop incomplete. Otherwise actually pause for any remaining interval,
   recheck the clock, send one GET if unexpired, then save its observation time.
4. Continue status checks throughout readiness waits. Only `KEYWORD_RESEARCH`
   permits readiness: check at the chosen first/retry time, or now if the user's
   reported wait already meets the chosen first interval. If no readiness check
   occurred and remaining budget is at most the chosen retry interval, make one
   first readiness check while still unexpired.
   Elapsed time never proves readiness; do not sleep a whole readiness interval
   without status checks. In-execution delay is only before a status GET.
5. Check the deadline before all recovery calls, including release after ready
   research and 428 rechecks. Expiry or unusable clock/wait means stop calls,
   report incomplete, preserve IDs/status/times and end the turn for later
   requested resume. This ends monitoring, not the job, and proves no stall or
   failure. No automatic restart. Observed `SUCCESS` ends waiting and permits
   candidates even when an in-flight status response finishes at/after the deadline.

## API steps

All angle-bracket values below are illustrative placeholders. Substitute actual
returned values before sending any request.

### 1. Trigger

```
POST https://www.wixapis.com/promote/seo/v1/content-plan-flows/trigger
{}
```

Response: `{ "contentPlanFlowId": "<flow-uuid>" }`. Save this actual ID and return;
do not append status calls to this execution.
[Trigger Content Plan Generation Flow](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-content-plan-flow-v1/trigger-content-plan-generation-flow).

### 2. Read status

```
GET https://www.wixapis.com/promote/seo/v1/content-plan-flows/{contentPlanFlowId}
```

Minimal response example:

```json
{
  "contentPlanFlow": {
    "id": "<flow-uuid>",
    "status": "KEYWORD_RESEARCH",
    "keywordResearchId": "<research-uuid>"
  }
}
```

Read nested `contentPlanFlow.status`, not top-level `status`. If absent or
unrecognized, inspect and report uncertainty instead of silently polling.
Intermediate states may be skipped. Every in-progress state uses the same
[waiting policy](#waiting-without-losing-progress).

| Status | Action |
| --- | --- |
| `CREATED`, `SITE_ANALYSIS`, `SITE_SUMMARY` | Continue paced checks. Queued work does not prove missing prerequisites. |
| `KEYWORD_RESEARCH` | Follow readiness below. |
| `CONTENT_PLAN` | Continue paced checks; skip release. |
| `SUCCESS` | Read candidates. |
| `PENDING_REQUIREMENTS` | Stop; report the actual unmet requirement from evidence. Do not invent business data or trigger replacements. |
| `FAIL`, `CANCELED` | Report the actual ID and failure/cancellation, then stop. |
| `UNKNOWN` | Inspect and report uncertainty. |

[Get Content Plan Flow](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-content-plan-flow-v1/get-content-plan-flow).

### 3. Check research readiness

Only while latest status is `KEYWORD_RESEARCH` and the policy permits its first
check or retry, execute once:

```
GET https://www.wixapis.com/promote/seo/v1/content-plan-keyword-research-items
```

No parameters are required. The [public request schema and reference](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-keyword-research-v1/list-keyword-research-items)
allow optional `paging`; omit it for all items. The reserved `contentPlanFlowId`
parameter is ignored, so this GET returns the site's most recent research,
not a flow-selected result. A verified live GET with no parameters returned
nonempty items and the matching `keywordResearchId`:

```json
{
  "keywordResearchItems": [ { "id": "<item-id>" } ],
  "keywordResearchId": "<research-uuid>"
}
```

- Not found, empty items or a mismatched research ID: not ready for this flow.
  Retry at the policy's cadence while continuing status checks. Do not change the endpoint or search docs
  after an expected readiness 404.
- Nonempty items matching the flow's research ID: perform the fresh status check
  in step 4; elapsed time alone never authorizes release.
- Other errors: report and stop. A 403 indicates missing permission, not a reason
  to retry.

The linked reference documents not found when the site has no research.

### 4. Release only if still needed

**Not yet verified live:** the ready-then-release branch below follows the API
contract; the retained live evidence proves automatic completion and an early
428, not that this fallback advances a genuinely ready parked flow.

After matching nonempty readiness, make a **fresh status GET** for the same flow
in its own execution. Immediately decide: `CONTENT_PLAN` or `SUCCESS` means skip
release. Only fresh `KEYWORD_RESEARCH` with the same research ID permits release;
a pre-readiness status is insufficient. If the ID changed, return to paced
readiness checking. Send the release separately after rechecking the deadline:

```
POST https://www.wixapis.com/promote/seo/v1/create-content-plan
{ "contentPlanFlowId": "<flow-uuid>" }
```

Success: `{ "success": true, "contentPlanFlowId": "<flow-uuid>" }`.
Check `success`, not just HTTP status. If false, report its `message` and stop;
for errors other than the 428 handling below, report the error and stop. Success
is not completion: if status does not advance, continue paced checks only within
the remaining budget, then report incomplete with saved progress. Never repeat
the release to force advancement.

On HTTP `428`, do not release again in this attempt. Within the remaining
budget, recheck status: later statuses follow the table; `KEYWORD_RESEARCH`
returns to paced readiness checks. If still parked, report the refusal and
preserve progress. No retry loop or automatic replacement trigger.

Retain the actual returned flow ID. If different, keep both and report the
relationship: original ID requested, different ID returned. Do not claim the
original reached `SUCCESS` using observations of the returned flow. Continue
status checks before reading results; never release again to retrieve them.
Releasing an already successful flow can generate a new flow.
[Create Content Plan](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-blog-post-candidate-v1/create-content-plan).

### 5. Read and present the briefs

Only after observing `SUCCESS` for the flow whose candidates you will read:

```
GET https://www.wixapis.com/promote/seo/v1/content-plan-flows/{contentPlanFlowId}/blog-post-candidates
```

Example data, not the user's result:

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
  "pagingMetadata": { "count": 1, "cursors": {}, "hasNext": false }
}
```

Omitting `paging` returns all candidates. Titles, keywords and URLs are nested
under `briefData`, not candidate top-level fields. Report absent fields as
unavailable; do not invent replacements. `pageUrl` is the existing page the
brief supports, not a published post URL.

The final reply must include actual flow ID, observed `SUCCESS`, count and a
table of returned titles, keywords, main keywords and clickable supporting URLs.
If shortened, identify the subset and total. Do not end with only a count or a
promise to show topics later. Faithfully show weak results too: explain if they
are repetitive or disconnected from the business. Successful generation does
not establish editorial quality or promise rankings. Suggest useful business
context without changing settings.
[List Blog Post Candidates](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-blog-post-candidate-v1/list-blog-post-candidates).

## Editing keywords (optional)

A request to edit does not bypass readiness. For known `KEYWORD_RESEARCH`, use
step 3 and edit only matching research. For earlier in-progress statuses or
`CONTENT_PLAN`, follow the bounded status policy until `SUCCESS` before editing;
if waiting cannot complete, report incomplete and make no edit. For an already
complete flow or no in-progress flow, read research once, matching its ID to the
known flow's research ID where available. On not found or mismatch, report not
ready instead of retrying immediately.

Only `keyword` and `main_keyword` are writable, using a field mask:

```
PATCH https://www.wixapis.com/promote/seo/v1/keyword-research-items/{itemId}
{
  "keywordResearchId": "<research-uuid>",
  "item": { "id": "<item-id>", "keyword": "new keyword" },
  "fieldMask": "keyword"
}
```

The copy-on-write response can contain a different `keywordResearchId`; use it
for the next write. Edits do not persist across generations.
