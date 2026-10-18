import "./env";
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function localRoot(): string {
  const configured = process.env.DATA_DIR;
  if (configured) return path.resolve(process.cwd(), configured);
  return path.resolve(process.cwd(), "../../.data");
}

function s3(): S3Client | null {
  if (!process.env.S3_ENDPOINT) return null;
  return new S3Client({
    region: process.env.S3_REGION || "eu-north-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "straume",
      secretAccessKey: process.env.S3_SECRET_KEY || "straume-dev-secret",
    },
  });
}

let bucketReady: Promise<void> | null = null;

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    })();
  }
  await bucketReady;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const client = s3();
  if (!client) {
    const file = path.join(localRoot(), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return;
  }
  const bucket = process.env.S3_BUCKET || "straume";
  await ensureBucket(client, bucket);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const client = s3();
  if (!client) {
    try {
      const body = await readFile(path.join(localRoot(), key));
      return { body, contentType: contentTypeFromName(key) };
    } catch {
      return null;
    }
  }
  const bucket = process.env.S3_BUCKET || "straume";
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    return { body: Buffer.from(bytes), contentType: result.ContentType || contentTypeFromName(key) };
  } catch {
    return null;
  }
}

function contentTypeFromName(key: string): string {
  if (key.endsWith(".pdf")) return "application/pdf";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".svg")) return "image/svg+xml";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".m4a") || key.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}
