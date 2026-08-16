import fs from "fs";
import { pipeline } from "stream/promises";
import { S3 } from "aws-sdk";
import path from "path";

// replace with your own credentials
const s3 = new S3({
    accessKeyId: "7ea9c3f8c7f0f26f0d21c5ce99d1ad6a",
    secretAccessKey: "b4df203781dd711223ce931a2d7ca269cdbf81bb530de4548474584951b798be",
    endpoint: "https://e21220f4758c0870ba9c388712d42ef2.r2.cloudflarestorage.com"
})

//create a download s3 folder that will download all files from a given location in s3
//have id present for the s3 folder which will be present in vercel bucket in s3 output/${id}

export async function downloadS3Folder(prefix: string) {
    const allFiles = await s3.listObjectsV2({
        Bucket: "vercel",
        Prefix: prefix
    }).promise();

    const allPromises = allFiles.Contents?.map(async ({ Key }) => {
        if (!Key || Key.endsWith("/")) return; // Skip directories
        const finalOutputPath = path.resolve(process.cwd(), Key);
        const dirName = path.dirname(finalOutputPath);

        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }

        const readStream = s3.getObject({ Bucket: "vercel", Key }).createReadStream();
        const writeStream = fs.createWriteStream(finalOutputPath);

        await pipeline(readStream, writeStream);
    });

    console.log("awaiting");

    await Promise.all(allPromises);
}