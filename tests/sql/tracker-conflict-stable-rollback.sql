-- Entirely synthetic. Caller supplies BEGIN/ROLLBACK after migration114.
do $$
declare mode text;key text;before_row ar_private.tracker_conflicts;after_row ar_private.tracker_conflicts;result jsonb;actor uuid:=ar_private.access_owner();
begin
 insert into public.ar_accounts(hotel,id,name,type,open,over90,items,verification_state) values('KAT','SYNTHETIC114','Synthetic conflict audit','SYNTHETIC',5,0,1,'verified');
 insert into public.ar_invoices(hotel,account_id,id,transaction_date,original,open,verification_state,collection_role,compressed,synced_at) values('KAT','SYNTHETIC114','i',current_date,5,5,'verified','standalone',false,now());
 insert into ar_private.tracker_bindings(region,owner,file_id) values('phuket',actor,'synthetic114_tracker_file_id') on conflict do nothing;
 foreach mode in array array['v0','v1','v2','v3','v4'] loop
  key:='synthetic114-'||mode;
  insert into ar_private.tracker_rows(region,row_key,hotel,account_id,invoice_id,identity,locator,sheet_values) values('phuket',key,'KAT','SYNTHETIC114','i','{}','{}','{}');
  perform ar_private.tracker_ledger_conflict('phuket',key,'S','synthetic','"30"','"31"','null',mode);
  select * into before_row from ar_private.tracker_conflicts where row_key=key;
  perform ar_private.tracker_ledger_conflict('phuket',key,'S','synthetic','"30"','"31"','null',mode);
  select * into after_row from ar_private.tracker_conflicts where row_key=key;
  if after_row is distinct from before_row then raise exception 'identical conflict changed: %',mode;end if;
  if mode in('v0','v3') then
   perform ar_private.tracker_ledger_conflict('phuket',key,'S','changed','"40"','"41"','"base"',mode);
   select * into after_row from ar_private.tracker_conflicts where row_key=key;
   if after_row is distinct from before_row then raise exception 'do-nothing mode changed: %',mode;end if;
  elsif mode='v1' then
   update ar_private.tracker_conflicts set reason='synthetic prior reason' where id=before_row.id;
   perform ar_private.tracker_ledger_conflict('phuket',key,'S','synthetic','"30"','"31"','null',mode);
   select * into after_row from ar_private.tracker_conflicts where row_key=key;
   if after_row.revision<>before_row.revision+1 or after_row.reason<>'web_changed_since_preview' then raise exception 'v1 real reason not advanced';end if;
  else
   perform ar_private.tracker_ledger_conflict('phuket',key,'S','synthetic','"40"','"31"','null',mode);
   select * into after_row from ar_private.tracker_conflicts where row_key=key;
   if after_row.revision<>before_row.revision+1 or after_row.sheet_value<>'"40"' then raise exception 'changed sheet not advanced: %',mode;end if;
   result:=public.ar_tracker_resolve(actor,'phuket',before_row.id,before_row.revision,'keep_web');
   if result->>'error'<>'tracker_revision_conflict' then raise exception 'stale revision accepted: %',mode;end if;
   before_row:=after_row;
   if mode='v4' then
    perform ar_private.tracker_ledger_conflict('phuket',key,'S','synthetic','"40"',null,'{"synthetic":1}',mode);
    select * into after_row from ar_private.tracker_conflicts where row_key=key;
    if after_row.revision<>before_row.revision+1 or after_row.web_value is not null or after_row.baseline<>'{"synthetic":1}' then raise exception 'null/json change lost';end if;
    before_row:=after_row;
    perform ar_private.tracker_ledger_conflict('phuket',key,'S','synthetic','"40"',null,'{"synthetic":1}',mode);
    select * into after_row from ar_private.tracker_conflicts where row_key=key;
    if after_row is distinct from before_row then raise exception 'repeated null/json conflict changed';end if;
   end if;
   result:=public.ar_tracker_resolve(actor,'phuket',before_row.id,before_row.revision,'keep_web');
   if result->>'resolved'<>'true' then raise exception 'current reviewed revision rejected: % %',mode,result;end if;
   perform ar_private.tracker_ledger_conflict('phuket',key,'S','synthetic','"50"','"31"','null',mode);
   if (select count(*) from ar_private.tracker_conflicts where row_key=key)<>2 then raise exception 'resolved history overwritten';end if;
  end if;
 end loop;
 if has_function_privilege('service_role','ar_private.tracker_ledger_conflict(text,text,text,text,jsonb,jsonb,jsonb,text)','execute') or has_function_privilege('authenticated','ar_private.tracker_ledger_conflict(text,text,text,text,jsonb,jsonb,jsonb,text)','execute') then raise exception 'tracker helper grant leak';end if;
end $$;
