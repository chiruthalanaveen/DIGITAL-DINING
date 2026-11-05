# Owner feature requests — implementation contract

Prepared 4 November 2026; reviewed 5 November 2026. This is a commerce-only request/review workflow, not authority
to enable a feature, change permissions, execute code, send a message, deploy or
charge. The eighth migration is `20261104160000_commerce_feature_requests.sql`.
The preceding seven files remain byte-for-byte unchanged and hosted installation
remains unapproved.

## RPCs and exact payloads

`commerce_feature_requests_owner(p_website_id uuid,p_action text default 'list',p_payload jsonb default '{}')`
is executable only by authenticated. It requires a currently verified Auth user
and active owner membership in the supplied, non-NULL website. Reads remain
available for an inactive website with retained active membership; submission
requires `setup` or `active`; an identical retained submission replay remains
available after the website becomes read-only. No business-type exclusion is
introduced for requirement tracking. It does not depend on products/orders/branding permission flags.

`commerce_feature_requests_admin(p_website_id uuid,p_action text,p_payload jsonb,p_actor_email text)`
is executable only by the actual service role, behind the existing signed Super
Admin BFF session. A NULL website is permitted only for its global `list` action.
The bounded actor email comes from that signed session, never the request body.

Both RPCs reject extra/missing/incorrectly typed payload keys:

| Action | Caller | Payload |
| --- | --- | --- |
| `list` | Owner/Admin | `{}` or paired `{before_created_at: ISO timestamp, before_id: UUID}` |
| `get` | Owner/Admin | `{request_id: UUID}` |
| `submit` | Owner | `{submission_key: UUID, title: string, description: string}` |
| `review` | Admin | `{request_id: UUID, expected_status: status, expected_revision: integer, status: status, note: string, assignment_reference: string, action_key: UUID}` |

Title is trimmed, 5–180 characters; description is trimmed, 10–6000. A review
requires a trimmed note of 1–2000 characters. Assignment reference is trimmed,
1–160 characters only when assigning, and otherwise must be the empty string.
SQL lengths count Unicode code points; the HTTP/UI enforce code-point minimums
and conservative UTF-16 maximums, so short emoji text is rejected before a
pending request is persisted. All text is displayed as plain text. References
are not executed or fetched.

## Status, replay and paging

Revision starts at 1. Transitions are:

- `submitted` → `under_review`, `approved` or `rejected`;
- `under_review` → `approved` or `rejected`;
- `approved` → `assigned`;
- `assigned` and `rejected` are terminal.

Assigned means queued for a separately controlled development task. It does not
claim implementation, testing, release or activation. No same-status note edit
or reopening is accepted. History is bounded to four events by these transitions.

Identical submission key plus original trimmed title/description returns the
same retained request with `replayed:true`; altered content conflicts. Admin
reviews use both expected status/revision and an action UUID. A fresh stale
review conflicts without mutation. Reusing an action UUID requires matching its
original expected status/revision, next status, note and assignment. Identical
retry returns the original action event and the current request/history, even
if a later permitted review has advanced it. It never rewinds the request.

Lists use `(created_at DESC,id DESC)` keyset order, 50 rows plus a look-ahead.
Cursor fields must appear together. Website NULL means the Admin's global queue;
each returned request still contains its bound website UUID.

## Safe response projections

Request: `{id,website_id,title,description,status,revision,review_note,assignment_reference,created_at,updated_at}`.

Event: `{id,request_id,revision,from_status,to_status,note,assignment_reference,actor_kind,created_at}`.
`actor_kind` is `owner` or `admin`. Neither projection exposes submission/action
keys, submitter UUID or actor email. Current authorized website owners see the
website's retained business request history, including a predecessor's request;
revoked/foreign owners cannot read it. Private event actor identity remains
administrative evidence only.

- List: `{website_id,requests,has_more,next_cursor:{created_at,id}|null}`.
- Get: `{website_id,request,events}`.
- Submit: detail plus `{replayed:boolean}`.
- Review: detail plus `{replayed:boolean,action_event: safe event}`.

The HTTP layer adds its normal success/capability envelope and validates this
projection. A missing optional schema is an unavailable capability, not a
successful empty list; a mutation must fail closed. Denied, timed-out and
malformed responses must not be treated as missing capability or success.

## Authorization and preservation

Owner RPC lock order is website SHARE, verified Auth SHARE, then active owner
membership SHARE, followed by request lookup/insert. Checks are repeated after
waits. Admin review uses website SHARE then request UPDATE. Request fields are
immutable except the validated revision/status/review fields and updated time.
An AFTER trigger appends history atomically for every insert or state change.
Public requests have one verified-owner SELECT policy and authenticated SELECT
only on the ten safe request columns. Raw `SELECT *`, internal submitter/replay
keys, and all direct mutations remain denied. Private events have RLS and no direct API grants or
policies, and reject update/delete. Functions pin an empty search path and
revoke inherited privileges explicitly.

Installation adds only its new objects and changes no existing row, function,
policy, grant, wallet balance, payment, order history or cron job. Runtime review
appends one existing administrative audit row per newly accepted action; it
never rewrites prior audit/business records. Installation,
RLS/race/replay tests and reapplication failure are checked only in the guarded
loopback `commerce_test` fixture. Hosted Supabase acceptance is separate.


## Evidence boundary

The eight-file isolated SQL runner passes **702 assertions**, preserving the
prior 628 plus 74 new cases. The new SQL module contributes 62 cases; ten
race/paging cases plus installation preservation and atomic reapplication supply
the remaining twelve. Read the [object and migration review](feature-requests-migration-review.md)
and [database validation evidence](expansion-db-validation.md). Full application
and browser acceptance are reported separately; hosted Supabase/provider
acceptance remains unperformed.
