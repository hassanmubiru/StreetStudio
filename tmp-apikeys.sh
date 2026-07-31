#!/usr/bin/env bash
set +H
B=http://localhost:8080; E="ak-$(date +%s)@example.com"; PW='CorrectHorse9pass'
curl -s --max-time 8 -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" >/dev/null
TOKEN=$(curl -s --max-time 8 -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
OID=$(curl -s --max-time 8 -X POST $B/organizations -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"AK Org"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
A="Authorization: Bearer $TOKEN"; O="X-Organization-Id: $OID"
CRE=$(curl -s --max-time 8 -w '|%{http_code}' -X POST $B/api-keys -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"name":"CI key","permissions":["video:read"]}')
echo "apiKeys.create => $CRE"
KID=$(echo "$CRE" | sed -n 's/.*"apiKey":{"id":"\([^"]*\)".*/\1/p')
HASSECRET=$(echo "$CRE" | grep -q '"secret"' && echo yes || echo no)
echo "created key id=$KID (secret returned once: $HASSECRET)"
echo "apiKeys.list => $(curl -s --max-time 8 -w '|%{http_code}' $B/api-keys -H "$A" -H "$O")"
echo "list contains secret? => $(curl -s --max-time 8 $B/api-keys -H "$A" -H "$O" | grep -q '"secret"' && echo yes-LEAK || echo no-good)"
echo "apiKeys.revoke => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X DELETE $B/api-keys/$KID -H "$A" -H "$O")"
echo "list after revoke => $(curl -s --max-time 8 -w '|%{http_code}' $B/api-keys -H "$A" -H "$O")"
echo "negative foreign-org apiKeys.list (expect 403) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' $B/api-keys -H "$A" -H 'X-Organization-Id: 11111111-1111-4111-8111-111111111111')"
