// api/s3-presign.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch {}
  }
  const { filename, contentType } = body || {};
  if (!filename) return res.status(400).json({ error: "filename obrigatório" });

  const region = process.env.AWS_REGION || "us-east-1";
  const bucket =
    process.env.S3_BUCKET ||
    "arn:aws:s3:us-east-1:503821891242:accesspoint/s3-origin-put";

  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
  });

  const key = `uploads/${Date.now()}_${filename}`;
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || "application/octet-stream",
  });

  try {
    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    return res.status(200).json({ url, key, bucket, region });
  } catch (err) {
    console.error("[presign-error]", err);
    return res.status(500).json({ error: "failed to presign" });
  }
}
