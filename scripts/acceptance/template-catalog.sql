-- After the isolated namespace is provisioned, seed only version headers. The
-- renderer reads the approved immutable assets through the real read-only getter.
insert into ar_acceptance_private_20260911.statement_templates(hotel,version,active,assets)
select hotel,version,active,'{}'::jsonb from ar_private.statement_templates where active
on conflict(hotel,version) do nothing;
