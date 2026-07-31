#!/usr/bin/env bash
set +H
B=http://localhost:8080; E="crud-$(date +%s)@example.com"; PW='CorrectHorse9pass'
curl -s --max-time 8 -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" >/dev/null
TOKEN=$(curl -s --max-time 8 -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
OID=$(curl -s --max-time 8 -X POST $B/organizations -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"CRUD Org"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
A="Authorization: Bearer $TOKEN"; O="X-Organization-Id: $OID"
PID=$(curl -s --max-time 8 -X POST $B/projects -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"name":"Alpha"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "created project id=$PID"
echo "list => $(curl -s --max-time 8 -w '|%{http_code}' $B/projects -H "$A" -H "$O")"
echo "get => $(curl -s --max-time 8 -w '|%{http_code}' $B/projects/$PID -H "$A" -H "$O")"
echo "update(rename Beta) => $(curl -s --max-time 8 -w '|%{http_code}' -X PATCH $B/projects/$PID -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"name":"Beta"}')"
echo "get after rename => $(curl -s --max-time 8 -w '|%{http_code}' $B/projects/$PID -H "$A" -H "$O")"
echo "delete => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X DELETE $B/projects/$PID -H "$A" -H "$O")"
echo "get after delete (expect 404) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' $B/projects/$PID -H "$A" -H "$O")"
echo "list after delete => $(curl -s --max-time 8 -w '|%{http_code}' $B/projects -H "$A" -H "$O")"
echo "negative foreign-org list (expect 403) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' $B/projects -H "$A" -H 'X-Organization-Id: 11111111-1111-4111-8111-111111111111')"
