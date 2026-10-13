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
  ID, attempt recovery once using `POST https://www.wixapis.com/promote/seo/v1/create-content-plan`.
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
   conditional [recovery attempt](#4-attempt-documented-recovery-once).
3. If `CONTENT_PLAN` or `SUCCESS` appears automatically, skip readiness/release
   immediately.
4. After observed `SUCCESS`, [read and present the actual briefs](#5-read-and-present-the-briefs).

## Waiting without losing progress

**One API execution makes one HTTP request and returns.** This procedure uses
15-second status pacing and a 30-minute monitoring attempt as client policy,
not an API completion guarantee. Use a date/time capability and a documented
bounded pause that yields without HTTP calls or busy loops. `updatedAt` can stay
frozen; HTTP timestamps and request counts are not clocks.

1. Before starting, note the attempt start and fixed deadline in working notes.
   Never reset or extend the attempt. The first status GET needs no wait or
   previous check timestamp; it still honors the deadline.
2. After each response, record actual flow/research IDs, last status and clock
   times of the last status and readiness checks. Before a subsequent status GET,
   read current time using the same clock/units. Actually wait for the remainder
   of 15 seconds since the last status observation, then read the clock again.
   If now or the needed wait reaches the deadline, send no request.
3. Upon observing `KEYWORD_RESEARCH`, make the first readiness GET immediately.
   Retry readiness only after 120 real seconds from the previous readiness
   observation, continuing the 15-second status checks between retries. Earlier
   statuses never permit readiness. A user's reported wait replaces neither
   the actual ID nor status/readiness proof; elapsed time is not readiness.
4. Check the deadline before every waiting/recovery call, including release and
   428 rechecks. In-execution delay is allowed only before a status GET, never a
   long readiness sleep or multi-request loop. At expiry or unavailable clock/wait,
   stop calls, report incomplete, preserve IDs/status/times and end the turn for
   a later requested resume. Expiry ends monitoring and proves no stall or failure.
5. Observed `SUCCESS` ends waiting and permits reading candidates, even if a
   status request started within budget finishes at/after the deadline. Skip
   readiness/release at `CONTENT_PLAN` or `SUCCESS`; never automatically restart.

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

**Only the first status GET skips waiting. Every later status GET—including
fresh-readiness and 428 follow-ups—must be at least 15 real seconds after the
previous status response. Use a supported wait for the remaining interval;
a returned API call is not a wait. With no usable clock/wait, stop incomplete
instead of sending another GET. Always honor the shared deadline.**

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

Only while latest status is `KEYWORD_RESEARCH`, execute once at the first
observation or when the retry interval in the waiting procedure has elapsed:

```
GET https://www.wixapis.com/promote/seo/v1/content-plan-keyword-research-items
```

No parameters are required. [List Keyword Research Items](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-keyword-research-v1/list-keyword-research-items)
allows optional `paging`; omit it for all items. Request in the selected site's
authorization context. Compare the returned `keywordResearchId` with the current
flow rather than assuming the items belong to it. A verified parameter-free GET
returned nonempty items and a matching research ID:

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

### 4. Attempt documented recovery once

**Unconfirmed recovery attempt, not an established resolution:** the branch
below follows the documented API contract but has not been verified live for a
genuinely ready parked flow. It allows one attempt without promising advancement.

Check these conditions in order:

| Condition | Action |
| --- | --- |
| Deadline expired while the flow is in progress | Stop incomplete; preserve progress. No recovery call. |
| Nonempty matching research just returned; no status check since that read | Wait the remaining status interval, then make a fresh same-flow status GET in its own execution. |
| Fresh `CONTENT_PLAN` or `SUCCESS` | Skip release; follow the status table. |
| Fresh `KEYWORD_RESEARCH` with a changed research ID | Return to paced readiness checks. |
| Fresh `KEYWORD_RESEARCH`, same research ID, remaining budget, no previous release | Recheck the deadline, then POST once in a separate execution. |
| Release already attempted, or any other status | Do not release; follow the status table within the budget. |

```
POST https://www.wixapis.com/promote/seo/v1/create-content-plan
{ "contentPlanFlowId": "<flow-uuid>" }
```

The response is `{ "success": true, "contentPlanFlowId": "<flow-uuid>" }`
on success; this is not completion.

1. If `success` is false, report `message` and stop. Other errors also stop,
   except HTTP `428`: recheck status at the normal pace within the budget;
   `KEYWORD_RESEARCH` returns to readiness checks. Never release again.
2. On success, retain the actual returned flow ID. If different, keep both and
   report original ID requested versus different ID returned; never infer the
   original reached `SUCCESS` from observations of the returned flow.
3. Continue paced status checks. If it does not advance before the deadline,
   report incomplete with saved progress. No repeated release, replacement
   trigger or automatic restart to force advancement.

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
