import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2 } from "@lib/r2.js";
import { env } from "@lib/env.js";

export async function generateSignedR2Url(key: string, expiresInSeconds = 7200): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn: expiresInSeconds });
}
