# Git Repo Source Server

A simple Node.js Express server that serves a tar.gz archive of a specified folder from a Git repository. The server automatically pulls the latest changes from the specified branch if the local repo is out of sync with the remote origin. Access is secured via a token-based authentication header.

## Features

- **Automatic Git Sync**: Fetches and pulls the latest changes from the remote origin branch before serving.
- **On-Demand Archiving**: Creates a `src-{git-hash}.tar.gz` archive of the specified source folder (or the entire repo) only if it doesn't exist for the current commit hash.
- **Secure Access**: Requires a matching `auth` header token for the `/src` endpoint.
- **Health Check**: Simple `/health` endpoint for monitoring.
- **ESM Format**: Modern ES modules for better performance and tree-shaking.

## Prerequisites

- Node.js 18+ (with ESM support)
- Git installed on the server
- Linux server

## How to use


1. Clone this repository:

```sh
git clone git://github.com/zxdong262/src-server.git
cd src-server
```

1. Install dependencies:

```sh
npm install
```

1. Create a `.env` file in the project root and configure the required environment variables (see below).

1. Start the server:

```sh
node server.js
```

   For production, use a process manager like PM2:

```sh
npm install -g pm2
pm2 start server.js --name "git-repo-server"
```

## Environment Variables

Create a `.env` file with the following:

| Variable          | Description                                      | Required | Example                  |
|-------------------|--------------------------------------------------|----------|--------------------------|
| `HOST`            | Server host (bind address, e.g. 0.0.0.0 or 127.0.0.1) | No       | `127.0.0.1`                |
| `PORT`            | Server port                                      | No       | `3000`                   |
| `GIT_REPO_PATH`   | Absolute path to the Git repository folder       | Yes      | `/home/user/my-repo`     |
| `BRANCH_NAME`     | Git branch to track and pull from                | Yes      | `main`                   |
| `SRC_FOLDER`      | Folder to archive (`.` for entire repo)          | Yes      | `src` or `.`             |
| `TOKEN`           | Secret token for `/src` auth (GitHub secret)     | Yes      | `your-super-secret-token`|


Example `.env`:

```env
HOST=127.0.0.1
PORT=3000
GIT_REPO_PATH=/home/ubuntu/my-repo
BRANCH_NAME=main
SRC_FOLDER=src
TOKEN=mysecret
```

**Note**: Ensure the Git repo at `GIT_REPO_PATH` is already cloned and initialized. The server user must have read/write permissions on this path and execute permissions for Git.

## Usage

Start the server with `node server.js`. The server will listen on the specified port (default: 3000).

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
