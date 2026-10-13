---
name: "Generate and Read a Wix Site's Content Plan"
description: "Generate an SEO content plan for a Wix site, read its suggested blog post topics and keywords, and troubleshoot or resume an existing generation flow."
---

# Generate and Read a Wix Site's Content Plan

A **content plan** is a set of suggested blog post briefs, including titles,
keywords, and the existing site pages they support. A **content plan flow** is
the asynchronous job that generates those briefs. Its `contentPlanFlowId` is
a flow UUID, distinct from the site's ID, and its `status` reports progress.
Generation creates briefs, not published posts.

`KEYWORD_RESEARCH` means keyword research is running or already done; the
status alone does not say which. When the research finishes, the flow usually
moves to `CONTENT_PLAN` on its own, but it can also stay parked at
`KEYWORD_RESEARCH` after the research is ready. A
**Create Content Plan** request is the fallback for a flow that stays paused,
used only as [step 3](#3-wait-for-the-keyword-research) says: a release before
the research is ready gets the [not-ready `428`](#4-release-the-flow) and must
not be retried in a loop.

Use the selected site's authorization context. Trigger and Create Content Plan
are writes requiring **Manage SEO Settings**; execute them when the user has
requested generation or explicitly confirmed it.

A question about an existing flow stuck at `KEYWORD_RESEARCH` without its
flow ID is answered by
[Troubleshoot a flow stuck at KEYWORD_RESEARCH](#troubleshoot-a-flow-stuck-at-keyword_research).

## Troubleshoot a flow stuck at KEYWORD_RESEARCH

When the user reports an existing flow stuck at `KEYWORD_RESEARCH` and has not
given its `contentPlanFlowId`, make no API call. Your reply must contain all
five points below, in this order; a reply that only asks for the ID is
incomplete:
1. Ask for the flow's actual `contentPlanFlowId`, even when the user polls
   the API themselves: you need it to check and release the flow.
2. `KEYWORD_RESEARCH` is not a bug or a failure: it means keyword research
   is running or done. The flow usually moves to `CONTENT_PLAN` on its own
   when it finishes; if it stays at `KEYWORD_RESEARCH`, the status alone
   does not show whether the research is ready, so polling the flow will
   not tell them. Ten minutes of waiting does not prove readiness.
3. With the flow ID, first check the research
   (`GET https://www.wixapis.com/promote/seo/v1/content-plan-keyword-research-items`)
   for nonempty items with the flow's `keywordResearchId`.
4. Only if they exist, release the flow once with Create Content Plan
   (`POST https://www.wixapis.com/promote/seo/v1/create-content-plan`),
   which is on the Blog Post Candidate service, not the Content Plan Flow
   service they are polling. Releasing earlier is refused with HTTP `428`.
5. Use the bounded waiting policy below: pace status checks about 15 seconds
   apart, retry readiness about two minutes apart, and report incomplete after
   about 15 minutes without completion, preserving the actual ID and last
   status. If supported timing or waiting is unavailable, report incomplete
   and resume later; do not substitute rapid polling for elapsed time.

Points 3 and 4 belong in this reply even though they run only once the ID
arrives: they tell the user what will happen next. Name both endpoints, but
write no request body or URL with a placeholder ID, and never submit one. Do
not offer a new flow or a different site as an alternative to recovering the
ID. Then end the turn and wait for the ID. With the ID, continue with [Resume
or read an existing flow](#resume-or-read-an-existing-flow).

## Resume or read an existing flow

An existing flow is a job already started by a previous trigger, including one
discussed earlier in the conversation. To finish it or read its results:

1. Find its actual `contentPlanFlowId` in the conversation or a previous
   trigger/status response. A site ID is not a flow ID, even though both are
   UUIDs. If the ID is missing and the user reports an existing flow stuck at
   `KEYWORD_RESEARCH` (not a plan you are generating now), make no API call
   and reply as [Troubleshoot a flow stuck at
   KEYWORD_RESEARCH](#troubleshoot-a-flow-stuck-at-keyword_research) says. In
   any other case with a missing ID, also make no API call: ask for it and end
   the turn.
2. Read that flow with
   `GET https://www.wixapis.com/promote/seo/v1/content-plan-flows/{contentPlanFlowId}`.
   Read `contentPlanFlow.status`; see the response and status table in
   [Check the flow status](#2-check-the-status-until-keyword_research).
3. At `SUCCESS`, go directly to [Read the briefs](#6-read-the-briefs).
   At `KEYWORD_RESEARCH`, when completion is requested, follow
   [Wait for the keyword research](#3-wait-for-the-keyword-research) with this
   flow ID; it says when to call [Create Content Plan](#4-release-the-flow).
   For an earlier in-progress status, continue checking this same flow until
   it reaches `KEYWORD_RESEARCH`. If already at `CONTENT_PLAN`, continue to
   [Check until SUCCESS](#5-check-the-status-until-success) without calling Create Content
   Plan. For a terminal or unmet-requirement
   status, follow the status table and stop.
4. After Create Content Plan succeeds, retain its returned flow ID and
   [check until SUCCESS](#5-check-the-status-until-success), then
   [read the briefs](#6-read-the-briefs). Do not trigger a replacement or release
   a successful flow just to retrieve its results.

## Generate a new plan

When the user requests a new plan, follow these steps in order. The request and
response examples for each step are in [API steps](#api-steps).

1. [Trigger](#1-trigger) once and retain the returned flow ID.
2. [Check the flow status](#2-check-the-status-until-keyword_research) until `KEYWORD_RESEARCH`.
3. [Wait for the keyword research](#3-wait-for-the-keyword-research) by
   checking the flow status.
4. [Call Create Content Plan](#4-release-the-flow) once, only when step 3 says
   so; usually generation starts on its own and you skip this step.
5. [Check until SUCCESS](#5-check-the-status-until-success).
6. [Read the briefs](#6-read-the-briefs) and report the actual returned topics.

Only Trigger and Create Content Plan write data in the generation path. Do not
change the site's business profile, name, description, categories, or publication
state to accelerate it. Those are separate tasks requiring real user data and
authorization. `CREATED` can mean queued work, not missing setup.

## Waiting without losing progress

**One API execution makes one HTTP request and returns.** Decide what to do
next after each response. Never put multiple requests in a polling loop, busy
wait, or unbounded sleep.

Use a supported clock and waiting capability. Save the waiting start time,
first observed `KEYWORD_RESEARCH` time, last status-check time, last readiness
check time, actual flow ID, research ID and last status in your notes between
executions. Start a bounded waiting attempt when triggering or resuming the
flow. Check status about every 15 seconds and stop after about 15 real minutes
without completion, including time spent in `CREATED` or `CONTENT_PLAN`.
These are pacing and waiting budgets, not service completion guarantees.
`createdAt` and `updatedAt` are flow data, not a clock; `updatedAt` can stay
frozen while parked. Never infer elapsed time from request counts or HTTP fields.

Prefer a supported wait outside the API execution. When a JavaScript execution
runtime supports `Date.now`, `setTimeout` and the authenticated `wix.request`
helper, one bounded wait before one status request is also allowed. The example
below uses the selected site's authorization context through `scope: "site"`.
Supply `actualFlowId` from the retained response and `waitStartedAt` and
`lastStatusCheckedAt` from your saved clock observations; do not reset them
on each execution. Use this asynchronous function as the execution input:

```js
async function() {
  const deadline = waitStartedAt + 15 * 60 * 1000;
  const delayMs = Math.max(0, lastStatusCheckedAt + 15 * 1000 - Date.now());
  if (Date.now() + delayMs >= deadline) {
    throw new Error("Waiting budget exhausted; report incomplete with saved flow ID and status");
  }
  await new Promise(resolve => setTimeout(resolve, delayMs));
  if (Date.now() >= deadline) {
    throw new Error("Waiting budget exhausted; report incomplete with saved flow ID and status");
  }
  const response = await wix.request({
    scope: "site",
    method: "GET",
    url: `https://www.wixapis.com/promote/seo/v1/content-plan-flows/${actualFlowId}`
  });
  const flow = response.data.contentPlanFlow;
  const observedAt = Date.now();
  // Save observedAt as lastStatusCheckedAt for the next execution.
  return {
    observedAt,
    contentPlanFlow: {
      id: flow?.id,
      status: flow?.status,
      keywordResearchId: flow?.keywordResearchId
    }
  };
}
```

This example sends exactly one HTTP request; run the next check in a separate
execution after deciding from this response. Use only capabilities supported
by your runtime. If no supported clock or bounded wait is available, or the
budget expires, report incomplete with the actual flow ID and last observed
status, preserve progress and resume the same flow later. Do not claim success
or promise later completion. Identify trigger and release as writes if asked.

## API steps

### 1. Trigger

```
POST https://www.wixapis.com/promote/seo/v1/content-plan-flows/trigger
{}
```

Response:

```json
{ "contentPlanFlowId": "<flow-uuid>" }
```

`<flow-uuid>` and other angle-bracket values in these examples are placeholders;
substitute actual returned values before making requests. Return this response
and end this execution here. Save the ID before making any status request.
Do not append step 2 to the trigger script.
See [Trigger Content Plan Generation Flow](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-content-plan-flow-v1/trigger-content-plan-generation-flow).

### 2. Check the status until KEYWORD_RESEARCH

```
GET https://www.wixapis.com/promote/seo/v1/content-plan-flows/{contentPlanFlowId}
```

Execute this GET once and return its response, following the
[bounded waiting policy](#waiting-without-losing-progress). Repeat it as a
separate execution when another status check is needed. Keep the response compact: flow ID, status, and (once at `KEYWORD_RESEARCH`)
`keywordResearchId` suffice.

Example response, showing the public flow fields (optional fields may be absent):

```json
{
  "contentPlanFlow": {
    "id": "<flow-uuid>",
    "createdAt": "2026-09-08T10:00:00.000Z",
    "updatedAt": "2026-09-08T10:01:00.000Z",
    "status": "KEYWORD_RESEARCH",
    "origin": "AGENT",
    "summaryId": "<summary-uuid>",
    "keywordResearchId": "<keyword-research-uuid>"
  }
}
```

Read `contentPlanFlow.status`, not a top-level `status`. If it is missing,
inspect the response instead of silently looping. Always use this generation's
flow ID. A new flow can stay `CREATED` for a while before it starts: keep
checking through `CREATED`, `SITE_ANALYSIS` and `SITE_SUMMARY` within the
same 15-minute waiting budget. If it expires, report the actual ID and last
observed status as incomplete without inventing missing business prerequisites.
See [Get Content Plan Flow](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-content-plan-flow-v1/get-content-plan-flow).

`contentPlanFlow.status` is a string enum. Status checks may skip intermediate
states; decide from the returned value rather than requiring every transition.
Typical status progression: `CREATED` → `SITE_ANALYSIS` → `KEYWORD_RESEARCH`
→ `CONTENT_PLAN` (usually on its own; Create Content Plan only as step 3's
fallback) → `SUCCESS`.

| Status | Meaning and next action |
| --- | --- |
| `CREATED` | Queued or starting. Check the same flow again; do not change site settings. |
| `SITE_ANALYSIS` | Analyzing site pages. Continue separate checks. |
| `SITE_SUMMARY` | Summarizing existing content. Continue separate checks. |
| `KEYWORD_RESEARCH` | Keyword research running or done. Continue with [step 3](#3-wait-for-the-keyword-research). |
| `CONTENT_PLAN` | Generating briefs. Continue separate checks; do not release again. |
| `SUCCESS` | Ready. Read candidates in step 6. |
| `PENDING_REQUIREMENTS` | Missing business information. Stop checking and report the actual unmet requirement from evidence. Do not invent or update business data, or repeatedly trigger replacements. |
| `FAIL` | Generation failed. Report the flow ID and failure; do not silently start a replacement. |
| `CANCELED` | Canceled and cannot be resumed. Report it and stop. |
| `UNKNOWN` | No usable status. Inspect the response and report uncertainty instead of guessing progress. |

Pace checks about 15 seconds apart using supported waiting and elapsed time.
Completion time varies; follow the same bounded waiting policy for every
in-progress status.

### 3. Wait for the keyword research

Check the same flow's status about every 15 seconds using the supported
clock and wait described above. Record when you first observe `KEYWORD_RESEARCH`.
If the user reports it has already been in that state for at least five minutes,
that is enough to make the first readiness check now, but does not prove readiness.

- `CONTENT_PLAN`: skip Create Content Plan; continue with step 5.
- `SUCCESS`: go to step 6.
- Still `KEYWORD_RESEARCH` after about five real minutes in that state:
  check the research once, in a separate execution:

  ```
  GET https://www.wixapis.com/promote/seo/v1/content-plan-keyword-research-items
  ```

It takes no parameters and returns the site's most recent research. Keep only
`keywordResearchId` and the length of the `keywordResearchItems` array:

```json
{
  "keywordResearchItems": [ { "id": "<item-id>" } ],
  "keywordResearchId": "<keyword-research-uuid>"
}
```

| Response | Next action |
| --- | --- |
| `404` `NOT_FOUND: No Keyword research for given content plan` | Not ready yet. The request is correct; do not change it or look up docs. Retry readiness about two real minutes later within the waiting budget. |
| Empty items or a different `keywordResearchId` than the flow's | Not ready for this flow. Retry readiness about two real minutes later within the waiting budget. |
| Flow's `keywordResearchId`, at least one item | Ready. If the latest status is still `KEYWORD_RESEARCH`, call Create Content Plan once (step 4). |
| Any other error | Report it and stop. |

Between readiness checks, continue paced status checks: generation may start
on its own. Save the last readiness-check time so retries remain about two
minutes apart across executions. At the 15-minute waiting deadline, report
incomplete with the actual flow ID and last observed status. Do not extend the
budget by counting more calls. A release before research is ready gets the
[not-ready `428`](#4-release-the-flow); status or elapsed time never replaces
the nonempty matching research check.
See [List Keyword Research Items](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-keyword-research-v1/list-keyword-research-items).

### 4. Release the flow

```
POST https://www.wixapis.com/promote/seo/v1/create-content-plan
{ "contentPlanFlowId": "<flow-uuid>" }
```

Successful response:

```json
{
  "success": true,
  "contentPlanFlowId": "<flow-uuid>"
}
```

Failure response fields (the diagnostic text comes from the API):

```json
{
  "success": false,
  "message": "<reason returned by the API>"
}
```

The response fields are `success` (boolean), `message` (failure reason, only
when `success` is false), and `contentPlanFlowId` (flow UUID when returned).
Check `success` as well as the HTTP status. If false, report `message` and stop;
a successful HTTP response alone is not a completed plan.

The not-ready response is HTTP `428`. Detect it by the HTTP status alone; you
don't need to parse its body. An HTTP `428` means the flow can't be released right now. Do not call Create Content Plan again right away; check the
same flow's status once using the bounded waiting policy and follow it:

- Still `KEYWORD_RESEARCH`: readiness is uncertain. Return to
  [step 3](#3-wait-for-the-keyword-research) and recheck readiness at the paced
  cadence. Do not issue another release in this attempt; report the refusal
  if it remains parked. Preserve the flow for a later resume.
- `CONTENT_PLAN`: generation already started; continue with step 5.
- `SUCCESS`: go to step 6.

On success, retain the returned `contentPlanFlowId` for the next status check
and candidate read. This response is not the list of briefs: continue to steps
5 and 6. Do not call release again to retrieve results; on an already successful
flow it regenerates a plan under a new flow ID.
See [Create Content Plan](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-blog-post-candidate-v1/create-content-plan).

### 5. Check the status until SUCCESS

Use the same single-GET execution and nested response as step 2, with the
same flow ID. Pace requests about 15 seconds apart within the same 15-minute
waiting budget; `CONTENT_PLAN` does not reset the clock. At the deadline,
report incomplete with the actual ID and last observed status. Read candidates
in a subsequent execution only after observing `SUCCESS` for this flow.

### 6. Read the briefs

```
GET https://www.wixapis.com/promote/seo/v1/content-plan-flows/{contentPlanFlowId}/blog-post-candidates
```

Example response showing the fields needed to display one topic:

```json
{
  "blogPostCandidates": [
    {
      "id": "<candidate-id>",
      "briefData": {
        "h1Title": "How to Care for Handmade Ceramic Mugs",
        "keyword": "ceramic mug care",
        "mainKeyword": "handmade ceramic mugs",
        "pageUrl": "https://www.example.com/mugs"
      }
    }
  ],
  "pagingMetadata": { "count": 1, "cursors": {}, "hasNext": false }
}
```

This is illustrative data, not the user's results. Candidates can contain
additional fields; see the linked reference for the full contract. Omitting
`paging` returns all candidates in a single response. Each candidate's brief
fields are nested under `briefData`, not at the candidate's top level. Map them
directly:

```js
const topics = response.blogPostCandidates.map(candidate => ({
  id: candidate.id,
  title: candidate.briefData?.h1Title,
  keyword: candidate.briefData?.keyword,
  mainKeyword: candidate.briefData?.mainKeyword,
  supportingPageUrl: candidate.briefData?.pageUrl
}));
```

`pageUrl` identifies the existing site page the proposed post supports; it is
not the URL of a newly published blog post. Generation creates briefs, not
published posts. Do not read `candidate.title`, `candidate.keyword`, or
`candidate.pageUrl`, or infer missing data from those nonexistent top-level
fields. If a nested field is absent, report it as unavailable and inspect the
raw candidate before making another request. Report the actual returned
titles and available keywords/supporting page URLs. Do not invent briefs or
claim completion from the release response. Reading the candidates is not the
end of the task: your final reply must list them as
[Present the result](#present-the-result) describes.
See [List Blog Post Candidates](https://dev.wix.com/docs/api-reference/business-management/seo/content-plan-blog-post-candidate-v1/list-blog-post-candidates).

### Present the result

Start with the flow ID, observed `SUCCESS` status, and returned candidate count.
Use a compact table with one row per topic: suggested title, target keyword,
main keyword, and supporting page URL. Include the actual returned URL as a
link; do not merely say that each brief contains a URL. Avoid repeating SEO
titles and descriptions unless requested. If the answer must be shortened,
label the displayed subset and total explicitly instead of claiming to show all
topics. These are AI-generated suggestions; do not promise rankings or traffic.
The table belongs in your final reply to the user: never end the generation
with only a count, a summary, or a promise to show the topics later.
Assess the returned topics before recommending them: if they are repetitive,
mostly restate the site name, or lack a clear connection to the site's business,
say so plainly. Successful generation does not establish editorial quality.
Still show the actual results; do not silently replace weak titles with invented
ones or call them optimized without evidence. Explain what business context
would help assess or refine them, without modifying the site's settings.

## Editing keywords (optional)

Wait until [the keyword research is ready](#3-wait-for-the-keyword-research),
then, before or after step 4, read the keywords. Edit only items from the
flow's `keywordResearchId`.

A read before the research finishes returns a not found error or an earlier
research's `keywordResearchId`. A user request to see or edit keywords is not
a reason to check sooner. Treat it as during generation when a flow you know
of (triggered in this conversation, or whose ID the user gave you) has a
status check that last returned `CREATED`, `SITE_ANALYSIS` or
`KEYWORD_RESEARCH`: wait as step 3 says. Otherwise, read once; on a not found
error, tell the user the research is not ready yet instead of retrying.

```
GET https://www.wixapis.com/promote/seo/v1/content-plan-keyword-research-items
```

Edit one keyword (field-masked, only `keyword` and `main_keyword` writable):

```
PATCH https://www.wixapis.com/promote/seo/v1/keyword-research-items/{itemId}
{
  "keywordResearchId": "...",
  "item": { "id": "...", "keyword": "new keyword" },
  "fieldMask": "keyword"
}
```

**Copy-on-write:** the response may carry a different `keywordResearchId`.
Always use the one from the response for the next write. Edits are not
durable across generations.

## Do not

- Keep checking `KEYWORD_RESEARCH` after matching nonempty research is ready
  without the once-only Create Content Plan decision (step 4). A refused
  release must not be retried in a loop.
- Call Create Content Plan as soon as the status is `KEYWORD_RESEARCH`, before
  the flow's keyword research items exist.
- Check readiness before about five real minutes at `KEYWORD_RESEARCH`
  (step 3). A flow the user reports there for five minutes or more is checked
  once right away; the time alone does not prove readiness.
- Read candidates before `SUCCESS`.
- Retry after `PENDING_REQUIREMENTS`.
- Ask for a site ID.
- Retry after a 403 — the caller lacks **Manage SEO Settings**.
