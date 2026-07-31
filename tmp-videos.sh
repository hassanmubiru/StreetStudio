#!/usr/bin/env bash
set +H
B=http://localhost:8080; E="vid-$(date +%s)@example.com"; PW='CorrectHorse9pass'
FF=$(node -e "process.stdout.write(require('ffmpeg-static'))")
"$FF" -y -f lavfi -i testsrc=size=320x240:rate=24:duration=3 -c:v libx264 -pix_fmt yuv420p /tmp/v.mp4 >/dev/null 2>&1
curl -s --max-time 8 -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" >/dev/null
TOKEN=$(curl -s --max-time 8 -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
OID=$(curl -s --max-time 8 -X POST $B/organizations -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Vid Org"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
A="Authorization: Bearer $TOKEN"; O="X-Organization-Id: $OID"
USID=$(curl -s --max-time 8 -X POST $B/uploads -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"totalParts":1,"contentType":"video/mp4"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
curl -s --max-time 8 -X PUT "$B/uploads/$USID/parts/1" -H "$A" -H "$O" --data-binary @/tmp/v.mp4 >/dev/null
VID=$(curl -s --max-time 30 -X POST "$B/uploads/$USID/complete" -H "$A" -H "$O" | sed -n 's/.*"videoId":"\([^"]*\)".*/\1/p')
echo "created video via upload: $VID"
echo "videos.list => $(curl -s --max-time 8 -w '|%{http_code}' $B/videos -H "$A" -H "$O")"
echo "videos.get => $(curl -s --max-time 8 -w '|%{http_code}' $B/videos/$VID -H "$A" -H "$O")"
echo "videos.update(rename) => $(curl -s --max-time 8 -w '|%{http_code}' -X PATCH $B/videos/$VID -H "$A" -H "$O" -H 'Content-Type: application/json' -d '{"title":"My Clip"}')"
echo "videos.delete => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X DELETE $B/videos/$VID -H "$A" -H "$O")"
echo "videos.get after delete (expect 404) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' $B/videos/$VID -H "$A" -H "$O")"
echo "negative foreign-org videos.list (expect 403) => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' $B/videos -H "$A" -H 'X-Organization-Id: 11111111-1111-4111-8111-111111111111')"
