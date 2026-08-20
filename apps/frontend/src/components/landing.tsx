import { CardTitle, CardDescription, CardHeader, CardContent, Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import axios from "axios"

const BACKEND_UPLOAD_URL = "http://localhost:3000";

export function Landing() {
  const [repoUrl, setRepoUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [nameError, setNameError] = useState("");
  const [uploadId, setUploadId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deployed, setDeployed] = useState(false);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Deploy your GitHub Repository</CardTitle>
          <CardDescription>Enter the URL of your GitHub repository to deploy it</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name (Subdomain)</Label>
              <Input 
                id="project-name"
                onChange={(e) => {
                  setProjectName(e.target.value.toLowerCase());
                  setNameError("");
                }} 
                value={projectName}
                placeholder="myportfolio" 
              />
              {nameError && <p className="text-sm text-red-500">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-url">GitHub Repository URL</Label>
              <Input 
                id="github-url"
                onChange={(e) => setRepoUrl(e.target.value)} 
                placeholder="https://github.com/username/repo" 
              />
            </div>
            <Button onClick={async () => {
              setUploading(true);
              setNameError("");
              try {
                const res = await axios.post(`${BACKEND_UPLOAD_URL}/deploy`, {
                  repoUrl: repoUrl,
                  name: projectName
                });
                setUploadId(res.data.id);
                setUploading(false);
                
                const interval = setInterval(async () => {
                  const response = await axios.get(`${BACKEND_UPLOAD_URL}/status?id=${res.data.id}`);

                  if (response.data.status === "deployed") {
                    clearInterval(interval);
                    setDeployed(true);
                  }
                }, 3000);
              } catch (error: any) {
                setUploading(false);
                if (error.response && (error.response.status === 400 || error.response.status === 409)) {
                  setNameError(error.response.data.error);
                } else {
                  setNameError("An unexpected error occurred. Please try again.");
                }
              }
            }} disabled={uploadId !== "" || uploading || !projectName || !repoUrl} className="w-full" type="submit">
              {uploadId ? `Deploying (${projectName})` : uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {deployed && <Card className="w-full max-w-md mt-8">
        <CardHeader>
          <CardTitle className="text-xl">Deployment Status</CardTitle>
          <CardDescription>Your website is successfully deployed!</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="deployed-url">Deployed URL</Label>
            <Input id="deployed-url" readOnly type="url" value={`https://${projectName}.jaenil.dev`} />
          </div>
          <br />
          <Button className="w-full" variant="outline" asChild>
            <a href={`https://${projectName}.jaenil.dev`} target="_blank" rel="noreferrer">
              Visit Website
            </a>
          </Button>
        </CardContent>
      </Card>}
    </main>
  )
}