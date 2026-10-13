---
name: "Generate and Read a Wix Site's Content Plan"
description: "Generate an SEO content plan for a Wix site, read its suggested blog post topics and keywords, and troubleshoot or resume an existing generation flow."
---

# Generate and Read a Wix Site's Content Plan

A content plan contains suggested blog post briefs: titles, keywords and existing
site pages they support. Generation creates briefs, not published posts.
`contentPlanFlowId` identifies the asynchronous job; it is not the site ID.

**Verified live behavior, distilled from site runs on October 13, 2026:** one
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
   immediately; do not wait for the first-readiness threshold.
4. After observed `SUCCESS`, [read and present the actual briefs](#5-read-and-present-the-briefs).

## Waiting without losing progress

**One API execution makes one HTTP request and returns.** Decide after each
response. No multi-request polling loops, busy waits or unbounded sleeps.

Save supported clock observations: attempt start, first observed
`KEYWORD_RESEARCH`, last status/readiness checks; also save actual flow ID,
research ID and last status. `createdAt` and `updatedAt` are flow data, not a
clock; `updatedAt` can stay frozen while parked. Never infer time from HTTP
fields or request counts.

These are **chosen approximate client pacing, backoff and stop budgets**, not
API-required minimum waits, an SLA or measured completion times. Reasonable
pacing variation and safe earlier nonmutating readiness checks are acceptable;
readiness still requires latest status `KEYWORD_RESEARCH`, and release still
requires all step 4 proofs. Avoid rapid polling. Later statuses skip readiness.

- Check status about every 15 seconds.
- If still `KEYWORD_RESEARCH`, normally check readiness after about five minutes.
- Retry readiness about two minutes later, only within the remaining budget.
- Stop waiting about 15 minutes from trigger/resume; transitions never reset it.

A user-reported wait beyond the normal first-check interval allows a check now.
For a late transition to `KEYWORD_RESEARCH`, reserve the attempt's last two
minutes for one first readiness check if none has occurred. This exception does
not accelerate retries or extend the deadline; earlier statuses never permit
readiness checks.

Continue paced status checks throughout readiness waits. Do not sleep the whole
readiness interval inside an execution. Use a supported external wait or
persistent runtime state. A supported in-execution delay is allowed **only
before a status GET**, bounded by its cadence and the shared deadline.

Check the clock before every in-progress waiting/recovery request, including
readiness, release and 428 recovery. If the deadline expires after a ready
response, do not release. At expiry with an in-progress status, stop calls,
report incomplete and end the turn. Preserve all observations for a later
requested resume; do not immediately restart or extend the attempt to evade
the deadline. Observed `SUCCESS` ends waiting and permits candidate retrieval,
even if a status request begun within budget finishes at or after the deadline.
If supported timing/waiting is unavailable, also report incomplete with the
actual flow ID and last status; never replace elapsed time with rapid polling.

A capability-neutral **status-only** example:

1. Validate the actual saved flow UUID and consistent clock observations for
   attempt start and last check. Missing, placeholder or invalid values must not
   send a request. Use observations from the same supported clock and time units.
2. Compute next status-check time from the last observation plus the status
   cadence, and the shared deadline from attempt start plus the stop budget.
   If current time or waiting until the next due time would reach the deadline,
   report incomplete.
3. Use a supported external wait, or one bounded delay before this single status
   GET. Read the clock again afterward; if expired, send no request.
4. Otherwise send one [status GET](#2-read-status) using the actual flow ID,
   return its response, save the new clock observation and decide the next action.

This illustrates required guards, not a calling contract for any runtime.
Readiness GETs use their own backoff; never substitute this status cadence or
one long readiness sleep.

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

No parameters; it returns the site's most recent research:

```json
{
  "keywordResearchItems": [ { "id": "<item-id>" } ],
  "keywordResearchId": "<research-uuid>"
}
```

- `404` (`No Keyword research for given content plan`), empty items or a
  mismatched research ID: not ready for this flow. Retry at the policy's cadence
  while continuing status checks. Do not change the endpoint or search docs
  after an expected readiness 404.
- Nonempty items matching the flow's research ID: perform the fresh status check
  in step 4; elapsed time alone never authorizes release.
- Other errors: report and stop. A 403 indicates missing permission, not a reason
  to retry.

[List Keyword Research Items](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-keyword-research-v1/list-keyword-research-items).

### 4. Release only if still needed

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
Check `success`, not just HTTP status. If false, report its `message` and stop.
This response is not completion or a candidate list.

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
