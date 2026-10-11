-- Synthetic only; caller transaction restores every row.
create function pg_temp.publish_quality_probe(p_warnings jsonb,p_missing boolean default false) returns uuid language plpgsql as $$
declare run uuid:=gen_random_uuid();a jsonb;
begin
 a:=jsonb_build_object('id','SYNTHETIC113','name','Synthetic audit','type','SYNTHETIC','open',0,'over90',0,'items',0,'currency','THB','agingBuckets','[]'::jsonb,'business_date',current_date);
 if not p_missing then a:=a||jsonb_build_object('sourceWarnings',p_warnings);end if;
 insert into ar_private.refresh_runs(id,hotel,account_id,reason,status,lease_until) values(run,'KAT','SYNTHETIC113','manual','running',now()+interval '10 minutes');
 insert into ar_private.refresh_stage(job_id,hotel,account_id,payload) values(run,'KAT','SYNTHETIC113',jsonb_build_object('account',a,'invoices','[]'::jsonb));
 perform ar_private.publish_refresh_before_daily_capture(run,1);
 return run;
end $$;
