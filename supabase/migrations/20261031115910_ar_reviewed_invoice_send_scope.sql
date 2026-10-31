-- Coverage is editor source provenance, attached to the exact reviewed bytes.
-- No PDF parsing, filename inference, provider download or historical backfill.
create function ar_private.reviewed_invoice_ids(p_selected text[],p_exports jsonb) returns text[]
language plpgsql immutable set search_path='' as $$
declare e jsonb;v jsonb;covered text[]:='{}';unknown boolean:=false;
begin
 if jsonb_typeof(p_exports) is distinct from 'array' then raise exception 'document_export_invalid';end if;
 for e in select value from jsonb_array_elements(p_exports) loop
  if not e?'invoice_ids' then unknown:=true;continue;end if;
  if jsonb_typeof(e->'invoice_ids') is distinct from 'array' then raise exception 'document_export_invalid';end if;
  if jsonb_array_length(e->'invoice_ids')>cardinality(p_selected) then raise exception 'document_export_invalid';end if;
  for v in select value from jsonb_array_elements(e->'invoice_ids') loop
   if jsonb_typeof(v) is distinct from 'string' or not coalesce((v#>>'{}')=any(p_selected),false) then raise exception 'document_export_invalid';end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(e->'invoice_ids'))<>jsonb_array_length(e->'invoice_ids') then raise exception 'document_export_invalid';end if;
  covered:=covered||array(select jsonb_array_elements_text(e->'invoice_ids'));
 end loop;
 -- A legacy/mixed receipt is unknown, not permission to bill the full selection.
 if unknown or jsonb_array_length(p_exports)=0 then return null;end if;
 return array(select id from unnest(p_selected) with ordinality x(id,n) where id=any(covered) order by n);
end$$;

-- Email history is delivery evidence, distinct from the original preparation.
-- Prefer immutable member/attempt scope; legacy missing snapshots fall back to
-- their draft. Documents continues to describe the original selected sources.
create function ar_private.email_record_invoice_ids(p_delivery uuid,p_draft uuid,p_fallback text[]) returns text[]
language sql stable set search_path='' as $$
 select coalesce(
  (select b.invoice_ids from ar_private.combined_delivery_members b where b.delivery_id=p_delivery and b.draft_id=p_draft),
  (select case when jsonb_typeof(m.snapshot#>'{draft,invoice_ids}')='array' then array(select jsonb_array_elements_text(m.snapshot#>'{draft,invoice_ids}')) end from ar_private.mail_deliveries m where m.id=p_delivery and m.draft_id=p_draft),
  (select d.invoice_ids from public.ar_email_drafts d where d.id=p_draft),p_fallback)
$$;
revoke all on function ar_private.email_record_invoice_ids(uuid,uuid,text[]) from public,anon,authenticated,service_role;
do $$declare definition text:=pg_get_functiondef('public.ar_account_workspace_read(uuid,text,text,text,integer,integer)'::regprocedure);needle text;
begin
 needle:='j.statement_source,j.invoice_ids,cardinality(j.invoice_ids) as invoice_count';
 if strpos(definition,needle)=0 then raise exception 'reviewed_scope_account_email_records_drift';end if;
 execute replace(definition,needle,$n$j.statement_source,
 case when p_section='email_records' then ar_private.email_record_invoice_ids(m.id,d.id,j.invoice_ids) else j.invoice_ids end as invoice_ids,
 cardinality(case when p_section='email_records' then ar_private.email_record_invoice_ids(m.id,d.id,j.invoice_ids) else j.invoice_ids end) as invoice_count$n$);
end$$;
create function ar_private.reviewed_manifest(p_manifest jsonb,p_ids text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(value order by ordinality),'[]') from jsonb_array_elements(p_manifest) with ordinality where value->>'id'=any(p_ids)
$$;
revoke all on function ar_private.reviewed_invoice_ids(text[],jsonb),ar_private.reviewed_manifest(jsonb,text[]) from public,anon,authenticated,service_role;

do $$declare definition text;target regprocedure;needle text;
begin
 -- Existing upload receipts, ownership, revisions, lifecycle and mail guards stay.
 foreach target in array array[
  'ar_private.ar_document_review_before_abandon_guard(uuid,uuid,integer,jsonb,boolean)'::regprocedure,
  'public.ar_document_save_project(uuid,integer,text,jsonb,boolean)'::regprocedure
 ] loop
  definition:=pg_get_functiondef(target);
  needle:='(e-array[''name'',''storage_key'',''byte_count'',''sha256''])';
  if strpos(definition,needle)=0 then raise exception 'reviewed_scope_export_validation_drift: %',target;end if;
  definition:=replace(definition,needle,'(e-array[''name'',''storage_key'',''byte_count'',''sha256'',''invoice_ids''])');
  needle:=' -- Append references for every revision; no storage objects or older revisions are removed.';
  if strpos(definition,needle)=0 then raise exception 'reviewed_scope_revision_drift: %',target;end if;
  definition:=replace(definition,needle,' perform ar_private.reviewed_invoice_ids(j.invoice_ids,p_exports);'||chr(10)||needle);
  execute definition;
 end loop;

 -- New drafts freeze the reviewed union; old drafts remain readable. A new
 -- provider admission below rejects unknown scope rather than guessing it.
 target:='ar_private.ar_email_open_before_abandon_guard(uuid,uuid,integer)'::regprocedure;
 definition:=pg_get_functiondef(target);needle:='j.account_name,j.invoice_ids,j.purpose';
 if strpos(definition,needle)=0 then raise exception 'reviewed_scope_email_open_drift';end if;
 execute replace(definition,needle,'j.account_name,coalesce(ar_private.reviewed_invoice_ids(j.invoice_ids,j.exports),j.invoice_ids),j.purpose');

 -- A reconfirmation can remove/add delivered sources within the same immutable
 -- original job. Never rebind an attempted draft; all existing attempt guards stay.
 target:='public.ar_email_rebind(uuid,uuid,integer,uuid,integer,bigint)'::regprocedure;
 definition:=pg_get_functiondef(target);
 needle:='row(d.document_job_id,d.hotel,d.account_id,d.invoice_ids) is distinct from row(j.id,j.hotel,j.account_id,j.invoice_ids)';
 if strpos(definition,needle)=0 then raise exception 'reviewed_scope_rebind_identity_drift';end if;
 definition:=replace(definition,needle,'row(d.document_job_id,d.hotel,d.account_id) is distinct from row(j.id,j.hotel,j.account_id) or not d.invoice_ids<@j.invoice_ids');
 needle:='set document_revision=j.revision,exports=j.exports,revision=revision+1';
 if strpos(definition,needle)=0 then raise exception 'reviewed_scope_rebind_update_drift';end if;
 execute replace(definition,needle,'set document_revision=j.revision,exports=j.exports,invoice_ids=coalesce(ar_private.reviewed_invoice_ids(j.invoice_ids,j.exports),j.invoice_ids),revision=revision+1');

 -- The core claim already returns existing immutable attempts before this point.
 -- Freeze only covered workflow facts AND money snapshots before any Gmail POST.
 target:='ar_private.mail_claim_before_threads(uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(target);
 needle:='  if j.revision<>d.document_revision or not j.acknowledged';
 if strpos(definition,needle)=0 then raise exception 'reviewed_scope_claim_guard_drift';end if;
 definition:=replace(definition,needle,$n$  if ar_private.reviewed_invoice_ids(j.invoice_ids,j.exports) is null
   or d.invoice_ids is distinct from ar_private.reviewed_invoice_ids(j.invoice_ids,d.exports)
   or d.invoice_ids is distinct from ar_private.reviewed_invoice_ids(j.invoice_ids,j.exports)
   or cardinality(d.invoice_ids)=0 then return jsonb_build_object('error','email_package_changed');end if;
$n$||needle);
 needle:='''manifest'',j.manifest,''workflow'',hist';
 if strpos(definition,needle)=0 then raise exception 'reviewed_scope_claim_manifest_drift';end if;
 execute replace(definition,needle,'''manifest'',ar_private.reviewed_manifest(j.manifest,d.invoice_ids),''workflow'',hist');

 -- Combined members must use the same invoice union and money snapshot as the
 -- real single-message admission probe; original job selection is source identity.
 target:='ar_private.combined_validate_member(uuid,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(target);needle:='d.invoice_ids is distinct from j.invoice_ids';
 if strpos(definition,needle)=0 then raise exception 'reviewed_scope_combined_identity_drift';end if;
 definition:=replace(definition,needle,'d.invoice_ids is distinct from ar_private.reviewed_invoice_ids(j.invoice_ids,j.exports)');
 needle:='''manifest'',j.manifest,''workflow'',v#>''{snapshot,workflow}''';
 if strpos(definition,needle)=0 then raise exception 'reviewed_scope_combined_manifest_drift';end if;
 execute replace(definition,needle,'''manifest'',v#>''{snapshot,manifest}'',''workflow'',v#>''{snapshot,workflow}''');
end$$;
