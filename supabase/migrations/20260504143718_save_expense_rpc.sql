-- Atomic save: insert one expense + N expense_items in a single transaction.
-- security invoker so RLS still gates the inserts via the caller's JWT.

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
  p_items                jsonb
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
    -- home_amount mirrors original_amount until FX wiring lands
    p_original_amount,
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
  bigint, bigint, bigint, bigint, text, text, text, text, jsonb
) to authenticated;
