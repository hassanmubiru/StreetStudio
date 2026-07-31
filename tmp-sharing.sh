#!/usr/bin/env bash
set +H
B=http://localhost:8080; E="sh-$(date +%s)@example.com"; PW='CorrectHorse9pass'
FF=$(node -e "process.stdout.write(require('ffmpeg-static'))")
"$FF" -y -f lavfi -i testsrc=size=320x240:rate=24:duration=2 -c:v libx264 -pix_fmt yuv420p /tmp/s.mp4 >/dev/null 2>&1
curl -s --max-time 8 -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" >/dev/null
TOKEN=$(curl -s --max-time 8 -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
OID=$(curl -s --max-time 8 -X POST $B/organizations -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Sh Org"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
A="Authorization: Bearer $TOKEN"; O="X-Organization-Id: $OID"
USID=$(curl -s --max-time 8 -X POST $B/uploads -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"totalParts":1,"contentType":"video/mp4"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
curl -s --max-time 8 -X PUT "$B/uploads/$USID/parts/1" -H "$A" -H "$O" --data-binary @/tmp/s.mp4 >/dev/null
VID=$(curl -s --max-time 30 -X POST "$B/uploads/$USID/complete" -H "$A" -H "$O" | sed -n 's/.*"videoId":"\([^"]*\)".*/\1/p')
echo "video=$VID"
CRE=$(curl -s --max-time 8 -w '|%{http_code}' -X POST "$B/videos/$VID/share-links" -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{}')
echo "sharing.create => $CRE"
LID=$(echo "$CRE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
CRED=$(echo "$CRE" | sed -n 's/.*"credential":"\([^"]*\)".*/\1/p')
echo "sharing.get => $(curl -s --max-time 8 -w '|%{http_code}' "$B/share-links/$LID" -H "$A" -H "$O")"
echo "sharing.resolve (PUBLIC, no auth) => $(curl -s --max-time 8 -w '|%{http_code}' -X POST "$B/shared/resolve" -H 'Content-Type: application/json' -d "{\"credential\":\"$CRED\"}")"
echo "sharing.revoke => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X DELETE "$B/share-links/$LID" -H "$A" -H "$O")"
echo "sharing.resolve after revoke (expect 4xx) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X POST "$B/shared/resolve" -H 'Content-Type: application/json' -d "{\"credential\":\"$CRED\"}")"
echo "sharing.resolve bad credential (expect 4xx) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X POST "$B/shared/resolve" -H 'Content-Type: application/json' -d '{"credential":"nope"}')"
