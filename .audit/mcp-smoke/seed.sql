insert into users (id, email, email_verified)
values ('00000000-0000-4000-8000-000000000001', 'smoke@example.test', true)
on conflict (id) do nothing;

insert into oauth_clients (client_id, redirect_uris, client_name)
values ('smoke-client', array['http://localhost/cb'], 'smoke')
on conflict (client_id) do nothing;

insert into oauth_access_tokens (token, client_id, user_id, scopes, expires_at)
values ('smoke-token', 'smoke-client', '00000000-0000-4000-8000-000000000001',
        array['plants:read', 'plants:write', 'knowledge:read'], now() + interval '1 day')
on conflict (token) do update set expires_at = excluded.expires_at;

-- api_jwt payload is {"exp":9999999999}, so resolve-user never refreshes it.
insert into oauth_user_api_credentials (user_id, api_jwt, api_refresh_token)
values ('00000000-0000-4000-8000-000000000001',
        'e30.eyJleHAiOjk5OTk5OTk5OTl9.sig', 'smoke-refresh')
on conflict (user_id) do nothing;
