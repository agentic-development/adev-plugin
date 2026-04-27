import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

if (!process.env.AWS_ACCESS_KEY_ID) throw new Error('AWS_ACCESS_KEY_ID is required');
if (!process.env.AWS_REGION) throw new Error('AWS_REGION is required');

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function upload(bucket, key, body) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
  return { bucket, key };
}

export async function download(bucket, key) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return response.Body;
}

export async function remove(bucket, key) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
