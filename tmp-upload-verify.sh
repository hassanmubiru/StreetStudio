#!/usr/bin/env bash
set +H
B=http://localhost:8080
E="up-$(date +%s)@example.com"
PW='CorrectHorse9pass'
FF=$(node -e "process.stdout.write(require('ffmpeg-static'))")

# 1) real ~4s mp4, split into 2 parts
"$FF" -y -f lavfi -i testsrc=size=320x240:rate=24:duration=4 -f lavfi -i sine=frequency=440:duration=4 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest /tmp/up.mp4 >/dev/null 2>&1
SIZE=$(stat -c%s /tmp/up.mp4)
split -n 2 -d /tmp/up.mp4 /tmp/uppart.
echo "source mp4: $SIZE bytes; parts: $(ls -1 /tmp/uppart.* | wc -l)"

# 2) auth + org
curl -s --max-time 8 -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" >/dev/null
TOKEN=$(curl -s --max-time 8 -X POST $B/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$PW\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
OID=$(curl -s --max-time 8 -X POST $B/organizations -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Upload Org"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
AUTH="Authorization: Bearer $TOKEN"; ORG="X-Organization-Id: $OID"
echo "org=$OID token_len=${#TOKEN}"

# 3) uploads.create (totalParts=2)
CREATE=$(curl -s --max-time 8 -w '|%{http_code}' -X POST $B/uploads -H "$AUTH" -H "$ORG" -H 'Content-Type: application/json' -d '{"totalParts":2,"contentType":"video/mp4"}')
echo "uploads.create => $CREATE"
USID=$(echo "$CREATE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
OKEY=$(echo "$CREATE" | sed -n 's/.*"objectKey":"\([^"]*\)".*/\1/p')

# 4) PUT parts (binary)
echo "part1 => $(curl -s --max-time 8 -w '|%{http_code}' -X PUT "$B/uploads/$USID/parts/1" -H "$AUTH" -H "$ORG" --data-binary @/tmp/uppart.00)"
echo "part2 => $(curl -s --max-time 8 -w '|%{http_code}' -X PUT "$B/uploads/$USID/parts/2" -H "$AUTH" -H "$ORG" --data-binary @/tmp/uppart.01)"

# 5) complete (assemble + create video + process)
COMPLETE=$(curl -s --max-time 30 -w '|%{http_code}' -X POST "$B/uploads/$USID/complete" -H "$AUTH" -H "$ORG")
echo "uploads.complete => $COMPLETE"
VID=$(echo "$COMPLETE" | sed -n 's/.*"videoId":"\([^"]*\)".*/\1/p')

# 6) playback.manifest
echo "playback.manifest => $(curl -s --max-time 8 -w '|%{http_code}' "$B/videos/$VID/playback" -H "$AUTH" -H "$ORG")"

# 7) Range request on the assembled source object (206)
echo "--- Range bytes=0-99 on /objects/$OKEY ---"
curl -s --max-time 8 -D - -o /tmp/range.bin -H "$AUTH" -H "$ORG" -H 'Range: bytes=0-99' "$B/objects/$OKEY" | grep -iE "HTTP/|content-range|content-length|accept-ranges"
echo "range body bytes: $(stat -c%s /tmp/range.bin)"

# 8) full GET (200)
echo "--- full GET /objects/$OKEY ---"
curl -s --max-time 8 -o /tmp/full.bin -w 'HTTP %{http_code} size=%{size_download}\n' -H "$AUTH" -H "$ORG" "$B/objects/$OKEY"
echo "assembled size matches source: $([ "$(stat -c%s /tmp/full.bin)" = "$SIZE" ] && echo YES || echo "NO ($(stat -c%s /tmp/full.bin) vs $SIZE)")"

# 9) negative: foreign org uploads.create -> 403
echo "negative foreign-org uploads.create => $(curl -s --max-time 8 -o /dev/null -w 'HTTP %{http_code}' -X POST $B/uploads -H "$AUTH" -H 'X-Organization-Id: 11111111-1111-4111-8111-111111111111' -H 'Content-Type: application/json' -d '{"totalParts":1}')"
echo "VID=$VID OKEY=$OKEY"
