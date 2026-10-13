---
name: "Generate and Read a Wix Site's Content Plan"
description: "Generate an SEO content plan for a Wix site, read its suggested blog post topics and keywords, and troubleshoot or resume an existing generation flow."
---

# Generate and Read a Wix Site's Content Plan

A content plan contains suggested blog post briefs: titles, keywords and existing
site pages they support. Generation creates briefs, not published posts.
`contentPlanFlowId` identifies the asynchronous job; it is not the site ID.

**Live observations cover automatic progress and premature rejection only:**
two flows reached `SUCCESS` without a release and each returned 24 candidates
for the same flow. A separate premature Create Content Plan call returned HTTP
`428`. These runs establish neither completion timing nor recovery effectiveness.

**Recovery of a genuinely ready parked flow is unverified live.** Step 4 permits
one documented attempt without promising advancement. `KEYWORD_RESEARCH` can mean
research is running or done; status alone does not prove readiness. Release is
conditional on matching, nonempty research and a fresh keyword-stage status.

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

**One API execution makes one HTTP request and returns.** Enforce the following
conservative client monitoring policy: at least 15 seconds between status checks,
120 seconds between readiness retries and one fixed 30-minute attempt. These
limits are mandatory for this procedure; they are not API latency, rate-limit
requirements or a promise of completion. Use a date/time capability and a
supported bounded pause that yields without HTTP calls or busy loops.
`updatedAt` can stay frozen; HTTP timestamps and request counts are not clocks.

1. Before starting, persist a compact record in conversation state or writable
   working notes: attempt start, deadline, actual flow/research IDs, last status,
   last status/readiness clock observations and `releaseAttempted`. Set false only
   when no release has occurred; preserve known true on resume, and allow no release
   when its history is unknown. Read and update the record across executions; do not
   assume tool calls retain it. Use the same clock and units throughout. Never reset
   or extend the attempt. If the record or clock state is lost, stop incomplete
   instead of starting a new budget.
2. The first status GET needs no wait or previous observation, but honors the
   deadline. Save each response's IDs, status and clock observation in the record.
   Before every later status GET, read current time and wait the remainder of
   15 seconds since the last status observation. Read the clock again after the
   pause. If now or the needed wait reaches the deadline, send no request.
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
Intermediate states may be skipped. Queued work does not prove missing
prerequisites. Every in-progress state uses the same [waiting policy](#waiting-without-losing-progress).

| Status | Action |
| --- | --- |
| `CREATED` | Continue paced status checks. |
| `SITE_ANALYSIS` | Continue paced status checks. |
| `SITE_SUMMARY` | Continue paced status checks. |
| `KEYWORD_RESEARCH` | Follow readiness below. |
| `CONTENT_PLAN` | Continue paced checks; skip release. |
| `SUCCESS` | Read candidates. |
| `PENDING_REQUIREMENTS` | Stop; report the actual unmet requirement from evidence. Do not invent business data or trigger replacements. |
| `FAIL` | Report the actual ID and failure, then stop. |
| `CANCELED` | Report the actual ID and cancellation, then stop. |
| `UNKNOWN` | Inspect and report uncertainty. |

[Get Content Plan Flow](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-content-plan-flow-v1/get-content-plan-flow).

### 3. Check research readiness

Only while latest status is `KEYWORD_RESEARCH`, execute once at the first
observation or when the retry interval in the waiting procedure has elapsed.
**Do not sleep for 120 seconds before this GET. Continue paced status checks
between readiness retries; stop readiness checks as soon as a later status is observed.**

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

The linked reference documents that this endpoint returns HTTP `404` when the
site has no keyword research.

### 4. Attempt documented recovery once

Follow this sequence for the unconfirmed recovery branch. Keep the shared
[waiting policy](#waiting-without-losing-progress) throughout; each GET and POST
uses its own execution.

1. Check the monitoring deadline. If it has expired while the flow is in
   progress, stop incomplete and preserve IDs, status and clock observations.
2. Check whether release was already attempted. If so, leave this
   sequence and continue paced status checks within the remaining budget.
3. Confirm matching, nonempty research from the readiness step. Without that proof, return
   to readiness checks while continuing status checks.
4. Wait the remainder of the 15-second status interval. Make a fresh same-flow
   status GET after the readiness response; honor the deadline before the GET.
5. Read the fresh status. If it is not `KEYWORD_RESEARCH`, do not release:
   follow the status table. `CONTENT_PLAN` continues monitoring; `SUCCESS`
   proceeds to candidate reading.
6. Compare the fresh `keywordResearchId` with the readiness response. If it does
   not match, return to readiness checks without releasing.
7. Recheck the deadline. If still unexpired, mark `releaseAttempted` in the
   saved record and attempt release once:

   ```
   POST https://www.wixapis.com/promote/seo/v1/create-content-plan
   { "contentPlanFlowId": "<flow-uuid>" }
   ```

8. Handle HTTP `428` by making a paced status recheck within the remaining
   budget. Return to readiness checks only if still `KEYWORD_RESEARCH`; otherwise
   follow the status table. Leave this sequence. Never release again.
9. Stop on other errors or `success: false`; report the error or returned `message`.
10. On `success: true`, save the actual returned `contentPlanFlowId`. If different,
    retain both IDs and report which was requested and returned. Never infer
    original-flow completion from observations of the returned flow.
11. Continue paced status checks. A successful release response is not completion.
    At deadline, report incomplete with saved progress and end the turn. Never
    repeat release, trigger a replacement or restart automatically.

Success response: `{ "success": true, "contentPlanFlowId": "<flow-uuid>" }`.
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
