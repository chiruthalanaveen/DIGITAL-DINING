# Delivery PIN recovery review

The existing delivery login links to `/delivery/forgot-pin`. That page uses
GET/POST `/api/delivery/customer/forgot-pin`, so the URL is still required.
The page was introduced in commit `39d3bad` without an API handler. No recovery
handler, question-lookup/reset RPC, or authoritative delivery PIN/session schema
was found in checked-in source or local Git history. Existing registration calls
`delivery_customer_register_with_question` and `delivery_customer_register` do
not establish a reset contract.

The missing route now responds with JSON instead of a framework 404. Missing or
malformed store/mobile identifiers return HTTP 400. Every syntactically valid
account receives the same HTTP 503 `PIN_RECOVERY_UNAVAILABLE` response, without
question/account disclosure. The page displays that availability message. The
handler does not create a database client, read credentials, perform network
requests, log/return submitted secrets, set cookies, change PINs, or revoke
sessions. **This corrects route discovery and error feedback; it does not enable
or claim a successful PIN reset.**

No SQL migration required for this route/error-feedback correction. Any future
database recovery implementation requires its own reviewed, versioned migration
and separate development Supabase tests. No production connection or SQL was
used in this investigation.

Before enabling recovery, obtain the authoritative development schema and verify:

1. Store-bound account lookup and no cross-store reset, including mobile numbers
   present in more than one store. Avoid account enumeration in public responses.
2. Server-side limits on question lookup and reset attempts, atomic lockout and
   safe handling of concurrent attempts.
3. Verification of both the hashed security answer and hashed recovery code,
   without plaintext secrets in database logs or application logs.
4. An atomic transaction changes the PIN hash, rotates the recovery code,
   invalidates old sessions and rejects concurrent/replayed reset attempts.
5. Invalid answers/codes, missing accounts, and database failures leave the
   existing PIN, sessions and recovery code unchanged. A new recovery code must
   never be returned for a failed transaction.
6. Old and new PIN login behavior, old/new recovery code behavior, session
   revocation, cookie behavior, and desktop/mobile UI with isolated accounts.
7. Existing delivery customers, restaurant data, wallets, orders, payments, RLS
   policies and cron jobs remain preserved.

Run `node --test tests/delivery-pin-recovery.test.mjs` for the current offline
availability/validation/privacy regression checks. The user has now provided a
separate staging project (`gylicwwrmpqomregevqe`). Successful legacy PIN reset
testing still requires a verified recovery database contract and compatible
isolated delivery fixtures; the availability tests do not establish that reset
or session revocation works.
