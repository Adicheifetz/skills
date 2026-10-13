---
name: "Manage Site Collaborators"
description: Manages who has access to a Wix site as a collaborator (contributor) — finds the site's current collaborators, invites someone, removes a collaborator, and resends or revokes a pending collaborator invite. Use when the user wants to give someone access to the site, take it away, or follow up on an invitation that has not been accepted.
---
# Manage Site Collaborators

## Description
Changes who can work on a site: invite a collaborator, remove one, or resend / revoke an invitation that has not been accepted yet.

## API Endpoints
- `GET https://www.wixapis.com/roles-management/roles` — look up role IDs for invites
- `GET https://www.wixapis.com/roles-management/v2/contributors/query` — list the site's collaborators
- `POST https://www.wixapis.com/invites/site-invite/bulk` — send invites (returns the `inviteId`s)
- `POST https://www.wixapis.com/roles-management/contributor/remove` — remove a collaborator
- `POST https://www.wixapis.com/invites/site-invite/{inviteId}/resend` — resend a pending invite
- `POST https://www.wixapis.com/invites/site-invite/{inviteId}/revoke` — revoke a pending invite

Docs: [Contributors](https://dev.wix.com/docs/api-reference/account-level/user-management/sites/contributors/introduction), [Site Invites](https://dev.wix.com/docs/api-reference/account-level/user-management/sites/site-invites/introduction)

## What the APIs can and cannot look up

- **This recipe has everything you need for every call below: endpoint, request and response shape. Do not search the docs, read the method articles or query the API spec before calling.** Go straight to the call. If the user names someone only by email or name, your final message must ask for their account ID (or invite ID for an invite) — say this even when the lookup shows only the owner.
- **Never call Remove Contributor, revoke or resend until you have the exact ID from the user or from an earlier response.** Look-ups by email or name are not possible, so ask first. If the user names someone only by email or name, read this recipe, then reply asking for the account ID (and how to find it) — at most one Query Site Contributors call, and do not search other APIs for an email-to-account lookup or try bulk or guessed deletes. Your final message must say that collaborators can only be identified by account ID, and ask the user to provide it — even if the query failed or returned nothing useful.
- **Collaborators are identified by account ID, not email.** Query Site Contributors returns only `accountId` and `accountOwnerId` per collaborator. If the user names a collaborator by email or name, ask them for that person's account ID, or for how to find it, before removing anyone. Do not guess which account ID belongs to which person.
- **Invites are identified by `inviteId`.** There is no endpoint to list a site's pending invites. The `inviteId` is returned when the invite is created (`invites[].id` in the Bulk Invite response, Step 6) — keep it if you will need to resend or revoke later in the conversation. If the user does not have it, say that it cannot be looked up through the API and ask them to provide it.
- **Bulk Invite, resend and revoke are account-level calls.** Make them with account scope, not site scope. If a call is still rejected for authorization, the most likely cause is that these endpoints require an account-level API key rather than a site-level token — tell the user this.

## Steps

### 1. Establish which action the user wants and on whom

| User wants | Needs | Go to |
|---|---|---|
| Remove someone who already has access | their `accountId` | Step 2, then Step 3 |
| Remove themselves | their own `accountId` | Step 7 |
| Invite someone new | their email(s) and a role (`policyIds`) | Step 6 |
| Cancel an invite not yet accepted | the `inviteId` | Step 4 |
| Resend an invite not yet accepted | the `inviteId` | Step 5 |

Removal works only on existing collaborators; revoke and resend work only on pending invites. Do not use one for the other.

**When the user names the person only by email**, work out what that email is before acting:

1. **Invited earlier in this conversation?** If the email matches an `invites[].email` from a Bulk Invite response you received, you have its `inviteId`: treat the person as an invitee (Step 4 or 5). If the user asked to *remove* them, cancel the invite (Step 4) after confirming.
2. **Otherwise the email cannot be classified.** The APIs cannot say whether it belongs to a collaborator, a pending invitee, or nobody, so do not claim "not a collaborator" or "has no access". Say that collaborators are identified by account ID and invites by invite ID, and ask for the one that fits the request (for removal, the account ID). Do not guess from the contributors list.
3. **Wrong-mode guards.** Do not revoke or resend for someone the user says already has access, and do not remove someone the user says is only invited. In those cases tell the user which action applies instead (for example: "they have only been invited, so I can cancel the invite rather than remove them").

### 2. List the site's collaborators

```
GET https://www.wixapis.com/roles-management/v2/contributors/query
```

No filter is needed to list everyone. To narrow by role, pass `filter.policyIds` (up to 20 role IDs) as repeated query parameters. Response:

```json
{ "contributors": [ { "accountId": "<account GUID>", "accountOwnerId": "<owner user GUID>" } ] }
```

Always run this read-only query first, even when the user says to check with them before changing anything: the confirmation question comes after the lookup, never instead of it. Use it to confirm the `accountId` the user gave is a current collaborator before removing it. If it is not in the list, stop and tell the user they have no collaborator access to remove.

### 3. Remove a collaborator

Removal clears all of the collaborator's role assignments on the site, so they lose access. **Ask the user to confirm the exact account first**, then call:

```
POST https://www.wixapis.com/roles-management/contributor/remove
```
```json
{ "accountId": "<accountId from step 2>" }
```

The response is `{}` on success.

### 4. Revoke a pending invite

**Ask the user to confirm** which invite to cancel, then call, with no body:

```
POST https://www.wixapis.com/invites/site-invite/{inviteId}/revoke
```

The response is `{}`. Revoke applies to pending invites only; if the person has since accepted and appears in the Step 2 list, use Step 3 instead.

### 5. Resend a pending invite

**Ask the user to confirm**, then call, with no body:

```
POST https://www.wixapis.com/invites/site-invite/{inviteId}/resend
```

The response contains the invite: `invite.id`, `invite.email`, `invite.status` (Pending, Used, Deleted, Declined, Expired) and `invite.expirationDate`. Report the status back to the user.

### 6. Send an invite

Ask the user for the email address(es) (1–10) and which role to grant; `policyIds` are role IDs, not names. Look them up with `GET https://www.wixapis.com/roles-management/roles` ([Get Roles Info](https://dev.wix.com/docs/api-reference/account-level/user-management/accounts/users/get-roles-info)), which returns `predefinedRoles` and `customRoles`; use the ID of the role the user chose, and do not guess an ID. If the user has not named a role, ask which one. **Ask the user to confirm** the emails and role, since this sends real emails, then call:

```
POST https://www.wixapis.com/invites/site-invite/bulk
```
```json
{ "policyIds": ["<role id>"], "emails": ["person@example.com"] }
```

The response has `invites[]` (each with `id`, `email`, `status`, `expirationDate`) and `failedEmails` / `failedInvites`. Report any that failed. Keep each `invites[].id`: it is the `inviteId` for Steps 4 and 5.

### 7. Remove the current user from the site ("remove me")

The APIs cannot tell who is talking to you, so you need the user's own `accountId` from them. Then:

1. Run Step 2. If their account is not in the contributors list, stop: the site owner is not listed as a collaborator, and an owner can leave only after transferring ownership to another user. Tell them that and do not call Remove Contributor.
2. Tell the user this cannot be undone, ask them to confirm, then call Remove Contributor (Step 3) with their `accountId`.
3. On success, state clearly and in bold that they can no longer use this site's dashboard, and should close the tab or click the Wix logo at the top left to go to All Sites. For example: **You have been removed from this site. The dashboard will no longer work for you — close this tab or click the Wix logo at the top left to go to All Sites.**

## Reporting back

State what was done, to which account or email, and the outcome. Do not show raw IDs unless the user asks. Always say which of these happened:

- **Succeeded**, e.g. "The invite for james@bond.com has been canceled."
- **Failed**, e.g. "I couldn't resend the invite for james@bond.com. Please try again." If the call returns 403, say so and that these calls usually need an account-level API key.
- **Not done because the user declined to confirm**, e.g. "Understood — no invite was resent."

For resend, read `invite.status` in the response: if it is `Used`, the person already accepted and is now a collaborator, so say they already have access rather than that the invite was resent; `Declined`, `Expired` or `Deleted` mean the invite is no longer pending.
