-- MCP tokens issued before scopes were enforced carry an empty scope list.
-- Their users consented to full access, so grant every supported scope.
UPDATE "oauth_authorization_codes" SET "scopes" = ARRAY['plants:read', 'plants:write', 'knowledge:read'] WHERE cardinality("scopes") = 0;
UPDATE "oauth_access_tokens" SET "scopes" = ARRAY['plants:read', 'plants:write', 'knowledge:read'] WHERE cardinality("scopes") = 0;
UPDATE "oauth_refresh_tokens" SET "scopes" = ARRAY['plants:read', 'plants:write', 'knowledge:read'] WHERE cardinality("scopes") = 0;
