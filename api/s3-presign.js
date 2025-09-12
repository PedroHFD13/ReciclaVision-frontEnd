// api/s3-presign.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Em algumas configs, req.body pode vir como string
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { key, filename, contentType } = body || {};

  // Agora aceitamos "key" pronto OU "filename" (montamos um key básico)
  if (!key && !filename) {
    return res.status(400).json({ error: "key ou filename obrigatório" });
  }

  const region = process.env.AWS_REGION || "us-east-1";
  const bucket =
    process.env.S3_BUCKET ||
    "arn:aws:s3:us-east-1:503821891242:accesspoint/s3-origin-put";

  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN, // opcional
    },
  });

  // Se o client mandou "key", usamos exatamente ele
  const finalKey =
    key ||
    `uploads/${Date.now()}_${filename}`;

  const cmd = new PutObjectCommand({
    Bucket: bucket,                     // bucket name ou Access Point ARN
    Key: finalKey,
    ContentType: contentType || "application/octet-stream",
    // Não setamos ACL para evitar preflight extra; padrão já é "private"
  });

  try {
    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 }); // 5 min
    return res.status(200).json({ url, key: finalKey, bucket, region });
  } catch (err) {
    console.error("[presign-error]", err);
    return res.status(500).json({ error: "failed to presign" });
  }
}
