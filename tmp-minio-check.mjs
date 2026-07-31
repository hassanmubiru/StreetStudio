import { S3Client, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  credentials: { accessKeyId: "streetstudio", secretAccessKey: "streetstudio_dev_minio" },
  forcePathStyle: true,
});
const Bucket = "streetstudio-media";
const vid = process.argv[2];

const listed = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: `derivatives/${vid}/` }));
console.log(`objects under derivatives/${vid}/:`);
for (const o of listed.Contents ?? []) {
  console.log(`  ${o.Key}  size=${o.Size}`);
}
console.log("total:", (listed.Contents ?? []).length);
