# Data model

Authoritative description of the Postgres schema. Migrations in `supabase/migrations/` reference this. If you change the schema, update this doc in the same commit.

## Conventions

- All IDs are `uuid` with `gen_random_uuid()` default.
- Timestamps are `timestamptz` with `default now()`.
- Money is stored as `bigint` minor units (cents) — never `float` or `numeric` for amounts. Currency is a separate `char(3)` (ISO 4217).
- Soft deletes: `deleted_at timestamptz`. Always filter `deleted_at IS NULL` in queries. **A soft-delete must not run as an RLS-gated UPDATE through PostgREST.** SELECT policies carry `deleted_at IS NULL`, and Postgres re-applies the SELECT policy to any row a data-modifying statement returns; PostgREST emits a `RETURNING` for `.select()` **and** for `{ count: 'exact' }` (`WITH s AS (UPDATE … RETURNING …) SELECT count(*) FROM s`), so the just-soft-deleted row fails the SELECT policy and the statement errors with `new row violates row-level security policy` (verbatim per the PostgreSQL `CREATE POLICY` reference — it is thrown, never silently filtered). Suppressing `RETURNING` at the PostgREST layer is version-dependent and brittle. **Pattern used in this repo: an RLS-gated ownership pre-check on the user client (decides 404 without leaking presence), then the soft-delete `UPDATE` on the admin client (`createAdminClient()`, RLS bypassed) — robust regardless of policy text, drift, or PostgREST internals.** This is the standard "verify, then trusted server write" pattern (cf. `upsertUserOnFirstSeen`, the `/api/me` backfill). See `api/expenses/[id].ts` DELETE.
- RLS is enforced on every table. Anonymous access goes through a `trip_member_token` cookie/header that resolves to a `trip_members` row.

## Tables

### `users`

Mirrors authenticated Clerk users. One row per Clerk user.
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| clerk_user_id | text | UNIQUE, indexed |
| display_name | text | |
| email | text | |
| created_at | timestamptz | |

### `trips`

Top-level container. Owner is always a Clerk-authenticated user.
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| home_currency | char(3) | ISO 4217, e.g., "SGD" |
| owner_user_id | uuid | FK → users.id |
| auth_mode | text | enum: 'casual' (default), 'strict' |
| share_token | text | UNIQUE, randomly generated, used in share link |
| share_token_rotated_at | timestamptz | tracks rotation history |
| created_at | timestamptz | |
| deleted_at | timestamptz | |

### `trip_members`

Anyone associated with a trip. Can be authenticated (linked to `users`) or anonymous.
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| trip_id | uuid | FK → trips.id |
| user_id | uuid \| null | FK → users.id (null = anonymous) |
| anon_id | uuid \| null | client-generated, stored client-side, used to recognize returning anon users |
| display_name | text | required for all members |
| user_agent | text | soft signal |
| device_locale | text | soft signal |
| timezone | text | soft signal |
| geo_city | text | nullable; geolocated server-side, raw IP NOT stored |
| fingerprint_hash | text | hash of (canvas+screen+timezone+UA), tertiary signal |
| joined_at | timestamptz | |
| claimed_at | timestamptz | nullable; set when an anon member signs in and merges |

**Unique constraint:** `(trip_id, lower(display_name))` — same name = same person within a trip.
**Unique constraint:** `(trip_id, anon_id)` where anon_id IS NOT NULL.
**Unique constraint:** `(trip_id, user_id)` where user_id IS NOT NULL.

### `expenses`

| Column               | Type          | Notes                                                                                    |
| -------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| id                   | uuid          | PK                                                                                       |
| trip_id              | uuid          | FK → trips.id                                                                            |
| payer_member_id      | uuid          | FK → trip_members.id                                                                     |
| merchant             | text          | extracted by AI                                                                          |
| expense_date         | date          | extracted by AI; defaults to today                                                       |
| category             | text          | enum: 'meals', 'transport', 'lodging', 'entertainment', 'groceries', 'shopping', 'other' |
| original_amount      | bigint        | minor units in original_currency                                                         |
| original_currency    | char(3)       |                                                                                          |
| fx_rate              | numeric(18,8) | original_currency → trip.home_currency at expense time                                   |
| fx_rate_status       | text          | enum: 'fresh', 'stale' (api was down), 'updated' (refreshed after stale)                 |
| home_amount          | bigint        | computed cache: original_amount × fx_rate, in minor units of home_currency               |
| subtotal             | bigint        | pre-tax, pre-service                                                                     |
| service_charge       | bigint        | mandatory restaurant fee, applied before GST                                             |
| tip                  | bigint        | voluntary; separate from service_charge                                                  |
| tax_amount           | bigint        | GST or equivalent                                                                        |
| tax_mode             | text          | enum: 'inclusive', 'exclusive' (drives display + math)                                   |
| tax_label            | text          | e.g., 'GST', 'VAT', 'Sales Tax'                                                          |
| receipt_image_path   | text          | Supabase Storage path                                                                    |
| notes                | text          |                                                                                          |
| created_by_member_id | uuid          | FK → trip_members.id                                                                     |
| created_at           | timestamptz   |                                                                                          |
| updated_at           | timestamptz   |                                                                                          |
| deleted_at           | timestamptz   |                                                                                          |

**Math invariant:** `subtotal + service_charge + tip + tax_amount ≈ original_amount` within 1 cent. Validated client + server.

### `expense_items`

Line items extracted from receipt.
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| expense_id | uuid | FK → expenses.id |
| name | text | |
| quantity | numeric | default 1 |
| unit_amount | bigint | minor units |
| amount | bigint | quantity × unit_amount, cached |
| sort_order | int | preserves receipt order |

### `share_sets`

Reusable participant configurations within a trip (e.g., "all 4 of us", "just the girls").
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| trip_id | uuid | FK → trips.id |
| name | text | user-chosen or auto-generated |
| created_from_expense_id | uuid | nullable; the expense where this set was first used |
| last_used_at | timestamptz | for sorting suggestions |
| created_at | timestamptz | |

### `share_set_members`

| Column         | Type | Notes                |
| -------------- | ---- | -------------------- |
| share_set_id   | uuid | FK → share_sets.id   |
| trip_member_id | uuid | FK → trip_members.id |

PK: composite.

### `expense_item_splits`

How a line item is split. Either references a `share_set` (split equally among that set) or specifies explicit per-member amounts.
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| expense_item_id | uuid | FK → expense_items.id |
| trip_member_id | uuid | FK → trip_members.id |
| share_amount | bigint | minor units; member's portion of this item including proportional service+tax |
| share_rule | text | enum: 'equal_via_share_set', 'explicit_amount', 'percentage' |
| share_set_id | uuid | nullable; populated when share_rule = 'equal_via_share_set' |

### `audit_log`

Every mutation, with actor attribution. Critical for the "who deleted X?" use case.
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| trip_id | uuid | FK → trips.id |
| actor_member_id | uuid | FK → trip_members.id |
| action | text | enum: 'expense.create', 'expense.update', 'expense.delete', 'item.update', 'split.update', etc. |
| target_type | text | 'expense', 'item', 'split', etc. |
| target_id | uuid | |
| diff | jsonb | { before, after } |
| context | jsonb | { user_agent, geo_city, timezone, fingerprint_hash } |
| created_at | timestamptz | |

### `settlements`

Computed who-owes-whom. Cached for the settlement view.
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| trip_id | uuid | FK → trips.id |
| from_member_id | uuid | FK → trip_members.id |
| to_member_id | uuid | FK → trip_members.id |
| amount | bigint | in trip.home_currency, minor units |
| currency | char(3) | mirrors trip.home_currency at compute time |
| algorithm | text | enum: 'simplify', 'direct' |
| status | text | enum: 'pending', 'paid' |
| marked_paid_at | timestamptz | |
| computed_at | timestamptz | |

### `fx_rates`

Cache of fetched FX rates.
| Column | Type | Notes |
|---|---|---|
| from_ccy | char(3) | |
| to_ccy | char(3) | |
| rate | numeric(18,8) | |
| as_of | date | rate's effective date |
| fetched_at | timestamptz | when we fetched it |

PK: `(from_ccy, to_ccy, as_of)`.

## RLS sketch

- `trips`: owner can SELECT/UPDATE; members can SELECT.
- `trip_members`: members of the same trip can SELECT each other.
- `expenses`, `expense_items`, `expense_item_splits`: trip members can SELECT/INSERT; UPDATE/DELETE allowed in casual mode for any member, including collaborative split edits, and in strict mode only for the creator or owner.
- `audit_log`: members can SELECT for their trips; INSERT only via server-side function.
- `settlements`: members can SELECT; INSERT/UPDATE only via server-side function.

## Open questions

- [ ] Should `share_sets` be deletable, or only soft-deletable to preserve historical attribution?
- [ ] Should we precompute `member_balances` view for performance, or compute on-demand from `expense_item_splits`?
- [ ] How do we handle a member being removed from a trip mid-flight (after they've added expenses)?
