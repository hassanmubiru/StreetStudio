#!/usr/bin/env bash
set +H
B=http://localhost:8080; E="wh-$(date +%s)@example.com"; PW='CorrectHorse9pass'
curl -s --max-time 8 -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" >/dev/null
TOKEN=$(curl -s --max-time 8 -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
OID=$(curl -s --max-time 8 -X POST $B/organizations -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"WH Org"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
A="Authorization: Bearer $TOKEN"; O="X-Organization-Id: $OID"
CRE=$(curl -s --max-time 8 -w '|%{http_code}' -X POST $B/webhooks -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"eventType":"video.ready","url":"https://example.com/hook"}')
echo "webhooks.create => $CRE"
WID=$(echo "$CRE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "create leaks signingSecret? => $(echo "$CRE" | grep -q signingSecret && echo yes-LEAK || echo no-good)"
echo "webhooks.create non-HTTPS (expect 400) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X POST $B/webhooks -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"eventType":"video.ready","url":"http://insecure.example.com/hook"}')"
echo "webhooks.create unsupported-event (expect 400) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X POST $B/webhooks -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"eventType":"nope.bad","url":"https://example.com/hook"}')"
echo "webhooks.list => $(curl -s --max-time 8 -w '|%{http_code}' $B/webhooks -H "$A" -H "$O")"
echo "webhooks.delete => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X DELETE $B/webhooks/$WID -H "$A" -H "$O")"
echo "webhooks.list after delete => $(curl -s --max-time 8 -w '|%{http_code}' $B/webhooks -H "$A" -H "$O")"
echo "negative foreign-org webhooks.list (expect 403) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' $B/webhooks -H "$A" -H 'X-Organization-Id: 11111111-1111-4111-8111-111111111111')"
