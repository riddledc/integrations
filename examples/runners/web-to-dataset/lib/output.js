const fs = require("fs");
const path = require("path");
const { stringify } = require("csv-stringify/sync");
const archiver = require("archiver");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const S3_BUCKET = process.env.S3_BUCKET || "riddle-job-artifacts";

async function convertFormat(jsonlPath, format, outDir) {
  if (format === "jsonl") return jsonlPath;

  const lines = fs
    .readFileSync(jsonlPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  if (format === "json") {
    const outPath = path.join(outDir, "dataset.json");
    fs.writeFileSync(outPath, JSON.stringify(lines, null, 2));
    return outPath;
  }

  if (format === "csv") {
    const outPath = path.join(outDir, "dataset.csv");
    const columns = [
      "url", "title", "description", "content_text",
      "word_count", "status_code", "depth", "crawled_at",
    ];
    const csvData = stringify(lines, { header: true, columns });
    fs.writeFileSync(outPath, csvData);
    return outPath;
  }

  if (format === "zip") {
    const outPath = path.join(outDir, "dataset.zip");
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      archive.file(jsonlPath, { name: "dataset.jsonl" });
      const jsonPath = path.join(outDir, "dataset.json");
      fs.writeFileSync(jsonPath, JSON.stringify(lines, null, 2));
      archive.file(jsonPath, { name: "dataset.json" });
      archive.finalize();
    });
    return outPath;
  }

  return jsonlPath;
}

async function uploadToS3(filePath, s3Key) {
  const body = fs.readFileSync(filePath);
  const contentType = s3Key.endsWith(".jsonl")
    ? "application/x-ndjson"
    : s3Key.endsWith(".json")
    ? "application/json"
    : s3Key.endsWith(".csv")
    ? "text/csv"
    : "application/octet-stream";

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
    })
  );

  return `s3://${S3_BUCKET}/${s3Key}`;
}

async function uploadStringToS3(content, s3Key, contentType = "application/json") {
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: content,
      ContentType: contentType,
    })
  );

  return `s3://${S3_BUCKET}/${s3Key}`;
}

function formatExt(format) {
  const map = { jsonl: "jsonl", json: "json", csv: "csv", zip: "zip" };
  return map[format] || "jsonl";
}

module.exports = { convertFormat, uploadToS3, uploadStringToS3, formatExt };
