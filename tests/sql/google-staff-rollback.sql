begin;
do $$
declare admin uuid;uid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();r jsonb;blocked boolean;
begin
 admin:=ar_private.access_owner();
 r:=public.ar_access_staff_save(admin,cmd,null,'synthetic.staff@example.invalid','Synthetic Staff',array['phuket'],true,0);
 if r->>'displayName'<>'Synthetic Staff' or r->'regions'<>'["phuket"]'::jsonb then raise exception 'name or region lost';end if;
 if public.ar_access_staff_save(admin,cmd,null,'synthetic.staff@example.invalid','Synthetic Staff',array['phuket'],true,0) is distinct from r then raise exception 'replay changed';end if;
 blocked:=false;begin perform public.ar_access_staff_save(admin,cmd,null,'synthetic.staff@example.invalid','Other',array['phuket'],true,0);exception when others then blocked:=sqlerrm='access_command_conflict';end;if not blocked then raise exception 'name replay conflict not checked';end if;
 insert into auth.users(id,email,email_confirmed_at) values(uid,'synthetic.staff@example.invalid',now());
 if ar_private.staff_label(uid)<>'Synthetic Staff' then raise exception 'Google binding did not retain staff name';end if;
 if public.ar_access_self(uid)->'regions'<>'["phuket"]'::jsonb then raise exception 'regional grant lost';end if;
 blocked:=false;begin perform public.ar_access_staff_save(admin,gen_random_uuid(),null,'ar@katathani.com','Changed',array['phuket'],true,1);exception when others then blocked:=sqlerrm='access_administrator_locked';end;if not blocked then raise exception 'admin protection lost';end if;
 insert into auth.sessions(id,user_id,created_at) values(sid,uid,now()-interval '1 hour');
 if not public.ar_access_session_valid(uid,sid) then raise exception 'current session rejected';end if;
 update ar_private.login_policy set valid_after=now(),google_only=true;
 if public.ar_access_session_valid(uid,sid) then raise exception 'old refresh session survived cutover';end if;
 update auth.sessions set created_at=now()+interval '1 second' where id=sid;
 if not public.ar_access_session_valid(uid,sid) or public.ar_access_session_valid(admin,sid) then raise exception 'session user not checked';end if;
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 perform set_config('request.headers',jsonb_build_object('x-ar-actor',uid)::text,true);
 if ar_private.request_staff() is not null then raise exception 'client spoofed staff header';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 if ar_private.request_staff() is distinct from uid then raise exception 'trusted actor lost';end if;
 delete from ar_private.access_members where auth_user_id=uid;
 if ar_private.staff_label(uid)<>'Synthetic Staff' then raise exception 'deleted member lost history attribution';end if;
end$$;
rollback;
