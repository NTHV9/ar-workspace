-- Production template assets are configured data, not migration seeds.
-- These markers exercise SQL job registration only. They cannot render a PDF.
insert into ar_private.statement_templates(hotel,version,active,assets)
values('KAT','synthetic-local-recovery-v1',true,'{"synthetic":true,"purpose":"local SQL registration only; no rendering assets"}'),
      ('TSK','synthetic-local-recovery-v1',true,'{"synthetic":true,"purpose":"local SQL registration only; no rendering assets"}');
