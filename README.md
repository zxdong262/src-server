```javascript
import express from 'express';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const GIT_REPO_PATH = process.env.GIT_REPO_PATH;
const BRANCH_NAME = process.env.BRANCH_NAME;
const SRC_FOLDER = process.env.SRC_FOLDER;
const TOKEN = process.env.TOKEN;

if (!GIT_REPO_PATH || !BRANCH_NAME || !SRC_FOLDER || !TOKEN) {
  console.error('Missing GIT_REPO_PATH, BRANCH_NAME, SRC_FOLDER, or TOKEN in environment variables');
  process.exit(1);
}

const execAsync = promisify(exec);

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/src', async (req, res) => {
  const authHeader = req.headers.auth;
  if (!authHeader || authHeader !== TOKEN) {
    return res.status(401).send('Unauthorized');
  }

  try {
    // Fetch latest from origin
    await execAsync(`git -C ${GIT_REPO_PATH} fetch origin`);

    // Check git status
    const { stdout: statusOutput } = await execAsync(`git -C ${GIT_REPO_PATH} status`);
    const isUpToDate = statusOutput.includes(`Your branch is up to date with 'origin/${BRANCH_NAME}'`);

    if (!isUpToDate) {
      console.log('Repo not in sync, pulling...');
      await execAsync(`git -C ${GIT_REPO_PATH} pull origin ${BRANCH_NAME}`);
    }

    // Get current git hash
    const { stdout: hashOutput } = await execAsync(`git -C ${GIT_REPO_PATH} rev-parse HEAD`);
    const gitHash = hashOutput.trim().substring(0, 7); // Abbrev hash
    const tarFileName = `src-${gitHash}.tar.gz`;
    const tarFilePath = path.join(GIT_REPO_PATH, tarFileName);

    // Check if tar file exists
    try {
      await fs.access(tarFilePath);
      console.log('Tar file already exists, serving...');
    } catch {
      console.log('Creating tar file...');
      // Tar the specified folder (could be '.' for whole repo or a subfolder)
      await execAsync(`cd ${GIT_REPO_PATH} && tar -czf ${tarFileName} ${SRC_FOLDER}`);
    }

    // Serve the file
    res.download(tarFilePath);
  } catch (error) {
    console.error('Error in /src route:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
```

# Git Repo Source Server

A simple Node.js Express server that serves a tar.gz archive of a specified folder from a Git repository. The server automatically pulls the latest changes from the specified branch if the local repo is out of sync with the remote origin. Access is secured via a token-based authentication header.

Designed to run on Ubuntu servers, e.g., in a GitHub Actions workflow or as a standalone service.

## Features

- **Automatic Git Sync**: Fetches and pulls the latest changes from the remote origin branch before serving.
- **On-Demand Archiving**: Creates a `src-{git-hash}.tar.gz` archive of the specified source folder (or the entire repo) only if it doesn't exist for the current commit hash.
- **Secure Access**: Requires a matching `auth` header token for the `/src` endpoint.
- **Health Check**: Simple `/health` endpoint for monitoring.
- **ESM Format**: Modern ES modules for better performance and tree-shaking.

## Prerequisites

- Node.js 18+ (with ESM support)
- Git installed on the server
- Ubuntu server environment (tested on 20.04+)
- Basic familiarity with environment variables and process management (e.g., PM2 or systemd for production)

## Installation

1. Clone or create a project directory:
   ```
   mkdir git-repo-server && cd git-repo-server
   ```

2. Initialize the project and install dependencies:
   ```
   npm init -y
   npm install express dotenv
   ```

3. Copy the provided `server.js` into the project root.

4. Create a `.env` file in the project root and configure the required environment variables (see below).

5. Run the server:
   ```
   node server.js
   ```

   For production, use a process manager like PM2:
   ```
   npm install -g pm2
   pm2 start server.js --name "git-repo-server"
   ```

## Environment Variables

Create a `.env` file with the following:

| Variable          | Description                                      | Required | Example                  |
|-------------------|--------------------------------------------------|----------|--------------------------|
| `PORT`            | Server port                                      | No       | `3000`                   |
| `HOST`            | Server host to bind to (e.g., '0.0.0.0' for all interfaces) | No       | `0.0.0.0`                |
| `GIT_REPO_PATH`   | Absolute path to the Git repository folder       | Yes      | `/home/user/my-repo`     |
| `BRANCH_NAME`     | Git branch to track and pull from                | Yes      | `main`                   |
| `SRC_FOLDER`      | Folder to archive (`.` for entire repo)          | Yes      | `src` or `.`             |
| `TOKEN`           | Secret token for `/src` auth (GitHub secret)     | Yes      | `your-super-secret-token`|

Example `.env`:
```
PORT=3000
HOST=0.0.0.0
GIT_REPO_PATH=/home/ubuntu/my-repo
BRANCH_NAME=main
SRC_FOLDER=src
TOKEN=mysecret
```

**Note**: Ensure the Git repo at `GIT_REPO_PATH` is already cloned and initialized. The server user must have read/write permissions on this path and execute permissions for Git.

## Usage

Start the server with `node server.js`. The server will listen on the specified host and port (default: `0.0.0.0:3000`).

### Routes

- **GET `/health`**  
  Health check endpoint. Returns `OK` if the server is running. No auth required.

- **GET `/src`**  
  Serves the `src-{git-hash}.tar.gz` file.  
  - **Auth**: Requires `auth` header matching `TOKEN`.  
  - **Behavior**:  
    1. Fetches latest from origin.  
    2. Checks if local branch is up-to-date; pulls if not.  
    3. Gets current commit hash (abbreviated to 7 chars).  
    4. Creates tar.gz of `SRC_FOLDER` if it doesn't exist for that hash.  
    5. Downloads the file.  
  - **Response**: 200 with file download on success; 401 Unauthorized or 500 Internal Server Error on failure.

### Example Request (using curl)

```bash
curl -H "auth: mysecret" http://localhost:3000/src -o src-archive.tar.gz
```

## Security

- **Token Auth**: Uses a simple bearer token in a custom `auth` header. Store `TOKEN` as a GitHub Actions secret for workflows.  
- **HTTPS Recommended**: Enforce HTTPS in production to prevent token interception. Use a reverse proxy like Nginx with Let's Encrypt.  
- **Limitations**: This is basic auth—suitable for server-to-server (e.g., CI/CD). For public exposure, consider JWTs or API keys. Rotate tokens periodically.  
- **Git Safety**: Only pulls from the specified branch; no arbitrary commands executed.

## Troubleshooting

- **Git Errors**: Ensure Git is installed (`sudo apt install git`) and the repo path is valid. Check server logs for `exec` errors.  
- **Tar Creation Fails**: Verify `SRC_FOLDER` exists in the repo and permissions allow archiving.  
- **Port in Use**: Change `PORT` in `.env`.  
- **Missing Env Vars**: Server exits on startup if required vars are unset—check console output.

## License

MIT License. Feel free to use and modify.