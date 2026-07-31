#!/usr/bin/env bash
set +H
B=http://localhost:8080; E="cm-$(date +%s)@example.com"; PW='CorrectHorse9pass'
FF=$(node -e "process.stdout.write(require('ffmpeg-static'))")
"$FF" -y -f lavfi -i testsrc=size=320x240:rate=24:duration=2 -c:v libx264 -pix_fmt yuv420p /tmp/c.mp4 >/dev/null 2>&1
curl -s --max-time 8 -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" >/dev/null
TOKEN=$(curl -s --max-time 8 -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
OID=$(curl -s --max-time 8 -X POST $B/organizations -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Cm Org"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
A="Authorization: Bearer $TOKEN"; O="X-Organization-Id: $OID"
USID=$(curl -s --max-time 8 -X POST $B/uploads -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"totalParts":1,"contentType":"video/mp4"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
curl -s --max-time 8 -X PUT "$B/uploads/$USID/parts/1" -H "$A" -H "$O" --data-binary @/tmp/c.mp4 >/dev/null
VID=$(curl -s --max-time 30 -X POST "$B/uploads/$USID/complete" -H "$A" -H "$O" | sed -n 's/.*"videoId":"\([^"]*\)".*/\1/p')
echo "video=$VID"
CRE=$(curl -s --max-time 8 -w '|%{http_code}' -X POST "$B/videos/$VID/comments" -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"body":"Great clip!","timestamp":1}')
echo "comments.create => $CRE"
CID=$(echo "$CRE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "comments.list => $(curl -s --max-time 8 -w '|%{http_code}' "$B/videos/$VID/comments" -H "$A" -H "$O")"
echo "comments.react (on comment) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X POST "$B/reactions" -H "$A" -H "$O" -H 'Content-Type: application/json' -d "{\"targetType\":\"comment\",\"targetId\":\"$CID\",\"type\":\"thumbsup\"}")"
echo "comments.unreact => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X DELETE "$B/reactions" -H "$A" -H "$O" -H 'Content-Type: application/json' -d "{\"targetType\":\"comment\",\"targetId\":\"$CID\",\"type\":\"thumbsup\"}")"
echo "comments.delete => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X DELETE "$B/comments/$CID" -H "$A" -H "$O")"
echo "comments.list after delete => $(curl -s --max-time 8 -w '|%{http_code}' "$B/videos/$VID/comments" -H "$A" -H "$O")"
echo "negative foreign-org comments.list (expect 403) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' "$B/videos/$VID/comments" -H "$A" -H 'X-Organization-Id: 11111111-1111-4111-8111-111111111111')"
