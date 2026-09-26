-- YashFlow: allow Admin Direct Complete to finish without stage photo proof
-- Normal employee stage completion still requires photo proof or an authorized proof waiver.

create or replace function public.enforce_stage_photo_proof()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- admin_complete_order_v1 sets this transaction-local flag before closing
  -- active stage work. Direct Complete is an explicit admin override.
  if current_setting('yashflow.admin_direct_complete', true) = '1' then
    return new;
  end if;

  if old.status::text = 'in_progress'
     and new.status::text in ('completed', 'ready_for_approval')
  then
    if not exists (
      select 1
      from public.order_stage_proofs osp
      where osp.order_stage_work_id = old.id
        and osp.file_type = 'photo'
    )
    and not coalesce(old.proof_waived, false)
    then
      raise exception
        'Photo Proof Required: Upload a stage photo or use authorized Complete Without Proof.';
    end if;
  end if;

  return new;
end;
$function$;
