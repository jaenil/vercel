# Codebase Correctness & Architecture Audit Report

**Target Services:** `upload_service` & `deploy_service`  
**Workspace:** `vercel-monorepo`  
**Status:** Comprehensive Bug Report, Edge Cases & Potential Fixes

---

## 1. System Overview & Architecture Flow

The system is designed to provide an automated clone, upload, queue, and download pipeline mimicking Vercel's core deployment engine:

```text
[ Client Request: POST /api/v1/deploy ]
                │
                ▼
      ┌──────────────────┐
      │  upload_service  │
      └─────────┬────────┘
                │ 1. simpleGit.clone(url)
                ▼
         [ Local Storage ]
                │ 2. getAllFiles()
                ▼
         [ S3 / R2 Upload ] ──(Uploads files to S3)──► [ Cloudflare R2 / S3 ]
                │                                              ▲
                │ 3. LPUSH build-queue                         │
                ▼                                              │
         [ Redis Queue ]                                       │
                │                                              │
                │ 4. BRPOP / RPOP build-queue                  │
                ▼                                              │
      ┌──────────────────┐                                     │
      │  deploy_service  │                                     │
      └─────────┬────────┘                                     │
                │ 5. downloadS3Folder() ───────────────────────┘
                ▼
         [ Local Disk / Build Workspace ]
                │ 6. (Future: npm install & npm run build)
                ▼
         [ Deployment Target ]
```

---

## 2. High-Impact Edge Cases, Performance & Security (With Fixes)

---

### ⚠️ Issue 2: Inclusion of `.git` Directory in S3 Uploads
* **File:** [`upload_service/src/utils/file.ts`](file:///Users/jaenilparekh/Documents/cs50/vercel/upload_service/src/utils/file.ts#L4-L16)
* **The Problem:** `simpleGit().clone()` creates `.git/` with thousands of internal objects and packfiles. `getAllFiles()` traverses `.git` and uploads all internal git metadata to S3, multiplying upload time and storage by 10x-100x.

#### ❌ Problematic Code:
```typescript
// upload_service/src/utils/file.ts
export const getAllFiles = (folderPath: string) => {
    let response: string[] = [];
    const allFilesAndFolders = fs.readdirSync(folderPath);
    allFilesAndFolders.forEach(file => {
        const fullFilePath = path.join(folderPath, file);
        if (fs.statSync(fullFilePath).isDirectory()) {
            response = response.concat(getAllFiles(fullFilePath))
        } else {
            response.push(fullFilePath);
        }
    });
    return response;
}
```

#### ✅ Potential Fix:
```typescript
// upload_service/src/utils/file.ts
export const getAllFiles = (folderPath: string): string[] => {
    let response: string[] = [];
    if (!fs.existsSync(folderPath)) return response;

    const allFilesAndFolders = fs.readdirSync(folderPath);
    allFilesAndFolders.forEach(file => {
        // Skip .git internal directory
        if (file === ".git") return;

        const fullFilePath = path.join(folderPath, file);
        if (fs.statSync(fullFilePath).isDirectory()) {
            response = response.concat(getAllFiles(fullFilePath));
        } else {
            response.push(fullFilePath);
        }
    });
    return response;
};
```

---

### ⚠️ Issue 3: Hardcoded Cloudflare R2 / AWS Credentials in Source Files
* **Files:** 
  - [`upload_service/src/utils/aws.ts`](file:///Users/jaenilparekh/Documents/cs50/vercel/upload_service/src/utils/aws.ts#L6-L8)
  - [`deploy_service/src/utils/aws.ts`](file:///Users/jaenilparekh/Documents/cs50/vercel/deploy_service/src/utils/aws.ts#L8-L10)
* **The Problem:** Secret keys and access IDs are checked in directly to source control.

#### ❌ Problematic Code:
```typescript
const s3 = new S3({
    accessKeyId: "7ea9c3f8c7f0f26f0d21c5ce99d1ad6a",
    secretAccessKey: "b4df203781dd711223ce931a2d7ca269cdbf81bb530de4548474584951b798be",
    endpoint: "https://e21220f4758c0870ba9c388712d42ef2.r2.cloudflarestorage.com"
});
```

#### ✅ Potential Fix:
```typescript
const s3 = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.AWS_ENDPOINT
});
```

---

### ⚠️ Issue 4: High Memory Footprint with `fs.readFileSync`
* **File:** [`upload_service/src/utils/aws.ts`](file:///Users/jaenilparekh/Documents/cs50/vercel/upload_service/src/utils/aws.ts#L14)
* **The Problem:** Reads entire files synchronously into memory buffers. Multiple concurrent uploads of media or bundles can cause Node process Out-Of-Memory (OOM) crashes.

#### ❌ Problematic Code:
```typescript
// upload_service/src/utils/aws.ts
export const uploadFile = async (fileName: string, localFilePath: string) => {
    const fileContent = fs.readFileSync(localFilePath); // Reads whole file into RAM
    const response = await s3.upload({
        Body: fileContent,
        Bucket: "vercel",
        Key: fileName,
    }).promise();
    console.log(response);
}
```

#### ✅ Potential Fix:
```typescript
// upload_service/src/utils/aws.ts
export const uploadFile = async (fileName: string, localFilePath: string) => {
    const fileStream = fs.createReadStream(localFilePath); // Stream avoids memory buffering
    return await s3.upload({
        Body: fileStream,
        Bucket: process.env.BUCKET_NAME || "vercel",
        Key: fileName.replace(/\\/g, "/"),
    }).promise();
};
```

---

### ⚠️ Issue 5: Local Disk Space Exhaustion (No Cleanup)
* **Files:** `upload_service` & `deploy_service`
* **The Problem:** Repositories cloned to output folders are never deleted after upload/build. Server runs out of disk storage over time.

#### ✅ Potential Fix:
```typescript
// upload_service/src/routes/v1/index.ts
try {
    await simpleGit().clone(url, outputDir, ["--depth", "1"]);
    // ... uploads ...
} finally {
    // Guarantee cleanup of temporary clone directory
    if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
}
```

---

### ⚠️ Issue 6: S3 Pagination Limit (1,000 Files Truncation)
* **File:** [`deploy_service/src/utils/aws.ts`](file:///Users/jaenilparekh/Documents/cs50/vercel/deploy_service/src/utils/aws.ts#L17-L20)
* **The Problem:** `s3.listObjectsV2` returns a maximum of 1,000 items. Projects with >1,000 files will miss files without pagination.

#### ✅ Potential Fix:
```typescript
// deploy_service/src/utils/aws.ts
export async function getAllS3Objects(prefix: string) {
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;
    let contents: S3.ObjectList = [];

    while (isTruncated) {
        const res = await s3.listObjectsV2({
            Bucket: process.env.BUCKET_NAME || "vercel",
            Prefix: prefix,
            ContinuationToken: continuationToken
        }).promise();

        if (res.Contents) contents.push(...res.Contents);
        isTruncated = !!res.IsTruncated;
        continuationToken = res.NextContinuationToken;
    }
    return contents;
}
```

---

## 3. Component Correctness Matrix

| Pipeline Stage | Functionality | Current Status | Cause of Failure / Vulnerability |
| :--- | :--- | :--- | :--- |
| **Clone** | `simpleGit().clone` | ⚠️ Partially Working | Missing `.git` ignore; missing `try/catch`. |
| **File Indexing** | `getAllFiles` | ⚠️ Inefficient | Indexes `.git/` tree; synchronous filesystem traversal blocks event loop. |
| **Upload** | `uploadFile` | ⚠️ High Memory | File buffers read synchronously; missing cleanup. |
| **Download** | `downloadS3Folder` | ⚠️ Partially Working | Hits S3 pagination limit at 1,000 files. |
| **Build / Deploy** | Worker Pipeline | 💡 Not Implemented | Execution ends after download; build execution step is missing. |
