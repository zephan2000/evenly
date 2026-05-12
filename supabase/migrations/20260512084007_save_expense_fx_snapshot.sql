-- ADR 0007: FX rate snapshots at expense save time.
-- The original save_expense_with_items mirrored original_amount into
-- home_amount with a TODO. That bug surfaced as a VND 562,000 receipt
-- showing as "SGD 5,620.00" on the home hero (minor units of VND were
-- divided by the SGD decimals). Now the API route fetches the rate from
-- frankfurter.app, computes home_amount in the trip's home_currency
-- minor units, and passes fx_rate / fx_rate_status / home_amount in.
--
-- Postgres can't `create or replace` across a changed signature, so we
-- drop the old function and recreate it. The three new params are
-- appended at the end to keep argument ordering stable for any future
-- callers that build keyword args left-to-right.

drop function if exists public.save_expense_with_items(
  uuid, uuid, uuid, text, date, text, bigint, char(3),
  bigint, bigint, bigint, bigint, text, text, text, text, jsonb
);

create or replace function public.save_expense_with_items(
  p_trip_id              uuid,
  p_payer_member_id      uuid,
  p_created_by_member_id uuid,
  p_merchant             text,
  p_expense_date         date,
  p_category             text,
  p_original_amount      bigint,
  p_original_currency    char(3),
  p_subtotal             bigint,
  p_service_charge       bigint,
  p_tip                  bigint,
  p_tax_amount           bigint,
  p_tax_mode             text,
  p_tax_label            text,
  p_receipt_image_path   text,
  p_notes                text,
  p_items                jsonb,
  p_fx_rate              numeric(18,8),
  p_fx_rate_status       text,
  p_home_amount          bigint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_item       jsonb;
begin
  insert into public.expenses (
    trip_id,
    payer_member_id,
    created_by_member_id,
    merchant,
    expense_date,
    category,
    original_amount,
    original_currency,
    fx_rate,
    fx_rate_status,
    home_amount,
    subtotal,
    service_charge,
    tip,
    tax_amount,
    tax_mode,
    tax_label,
    receipt_image_path,
    notes
  ) values (
    p_trip_id,
    p_payer_member_id,
    p_created_by_member_id,
    p_merchant,
    p_expense_date,
    p_category,
    p_original_amount,
    p_original_currency,
    p_fx_rate,
    p_fx_rate_status,
    p_home_amount,
    p_subtotal,
    p_service_charge,
    p_tip,
    p_tax_amount,
    p_tax_mode,
    p_tax_label,
    p_receipt_image_path,
    p_notes
  )
  returning id into v_expense_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.expense_items (
      expense_id,
      name,
      quantity,
      unit_amount,
      amount,
      sort_order
    ) values (
      v_expense_id,
      v_item ->> 'name',
      coalesce((v_item ->> 'quantity')::numeric, 1),
      (v_item ->> 'unit_amount')::bigint,
      (v_item ->> 'amount')::bigint,
      coalesce((v_item ->> 'sort_order')::int, 0)
    );
  end loop;

  return v_expense_id;
end;
$$;

grant execute on function public.save_expense_with_items(
  uuid, uuid, uuid, text, date, text, bigint, char(3),
  bigint, bigint, bigint, bigint, text, text, text, text, jsonb,
  numeric, text, bigint
) to authenticated;
