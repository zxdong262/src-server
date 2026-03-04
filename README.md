[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![JavaScript](https://img.shields.io/badge/JavaScript-ESM-yellow?style=flat-square&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Express](https://img.shields.io/badge/Express-5.x-orange?style=flat-square&logo=express)](https://expressjs.com)
[![Vitest](https://img.shields.io/badge/Vitest-testing-blue?style=flat-square&logo=vitest)](https://vitest.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [中文](README.zh-CN.md)

# Git Repo Source Server

A simple Node.js Express server that serves a tar.gz archive of a Git repository. The server automatically pulls the latest changes from the specified branch if the local repo is out of sync with the remote origin. Access is secured via a token-based authentication header.

## Features

- **Multi-Repo Support**: Configure multiple Git repositories and serve from any of them using the `repo` query parameter.
- **Automatic Git Sync**: Fetches and pulls the latest changes from the remote origin branch before serving.
- **On-Demand Archiving**: Creates a `src-{repo-name}-{git-hash}.tar.gz` archive of the entire repository only if it doesn't exist for the current commit hash.
- **Secure Access**: Requires a matching `auth` header token for the `/src` endpoint.
- **Health Check**: Simple `/health` endpoint for monitoring.
- **Repo Discovery**: `/repos` endpoint to list available repositories.
- **ESM Format**: Modern ES modules for better performance and tree-shaking.

## Prerequisites

- Node.js 18+ (with ESM support)
- Git installed on the server
- Linux server

## How to use

1. Clone this repository:

```sh
git clone http://github.com/zxdong262/src-server.git
# or git clone git@github.com:zxdong262/src-server.git
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

| Variable              | Description                                                      | Required | Example                                      |
|-----------------------|------------------------------------------------------------------|----------|----------------------------------------------|
| `HOST`                | Server host (bind address, e.g. 0.0.0.0 or 127.0.0.1)           | No       | `127.0.0.1`                                  |
| `PORT`                | Server port                                                      | No       | `3000`                                       |
| `GIT_REPO_PATHS`      | Comma-separated list of allowed Git repository paths            | Yes      | `/home/user/repo1,/home/user/repo2`          |
| `DEFAULT_REPO_PATH`   | Default repository path (must be one of GIT_REPO_PATHS)         | Yes      | `/home/user/repo1`                           |
| `BRANCH_NAME`         | Git branch to track and pull from                                | Yes      | `main`                                       |
| `TOKEN`               | Secret token for `/src` auth (GitHub secret)                    | Yes      | `your-super-secret-token`                    |

**Note**: 
- `GIT_REPO_PATHS` accepts multiple comma-separated paths (no spaces around commas).
- `DEFAULT_REPO_PATH` must be one of the paths in `GIT_REPO_PATHS`.

Example `.env`:

```env
HOST=127.0.0.1
PORT=3000
GIT_REPO_PATHS=/home/ubuntu/repo1,/home/ubuntu/repo2
DEFAULT_REPO_PATH=/home/ubuntu/repo1
BRANCH_NAME=main
TOKEN=mysecret
```

**Note**: Ensure the Git repos at `GIT_REPO_PATHS` are already cloned and initialized. The server user must have read/write permissions on these paths and execute permissions for Git.

## Usage

Start the server with `node server.js`. The server will listen on the specified port (default: 3000).

### Routes

- **GET `/health`**  
  Health check endpoint. Returns `OK` if the server is running. No auth required.

- **GET `/repos`**  
  Returns a JSON object with the list of allowed repos and the default repo. No auth required.
  ```json
  {
    "repos": ["/path/to/repo1", "/path/to/repo2"],
    "default": "/path/to/repo1"
  }
  ```

- **GET `/src`**  
  Serves the entire repository as `src-{repo-name}-{git-hash}.tar.gz`.  
  - **Auth**: Requires `auth` header matching `TOKEN`.  
  - **Query Parameters**:
    - `repo` (optional): Specify which repo to use. Must be one of `GIT_REPO_PATHS`. If not provided, uses `DEFAULT_REPO_PATH`.
  - **Behavior**:  
    1. Validates the repo parameter (if provided).  
    2. Fetches latest from origin.  
    3. Checks if local branch is up-to-date; pulls if not.  
    4. Gets current commit hash (abbreviated to 7 chars).  
    5. Creates tar.gz of the entire repository if it doesn't exist for that hash.  
    6. Downloads the file.  
  - **Response**: 200 with file download on success; 400 for invalid repo; 401 Unauthorized or 500 Internal Server Error on failure.

### Example Request (using curl)

```bash
# Using default repo
curl -H "auth: mysecret" http://localhost:3000/src -o src-archive.tar.gz

# Using specific repo
curl -H "auth: mysecret" "http://localhost:3000/src?repo=/home/ubuntu/repo2" -o src-archive.tar.gz
```

## Security

- **Token Auth**: Uses a simple bearer token in a custom `auth` header. Store `TOKEN` as a GitHub Actions secret for workflows.  
- **HTTPS Recommended**: Enforce HTTPS in production to prevent token interception. Use a reverse proxy like Nginx with Let's Encrypt.  
- **Limitations**: This is basic auth—suitable for server-to-server (e.g., CI/CD). For public exposure, consider JWTs or API keys. Rotate tokens periodically.  
- **Git Safety**: Only pulls from the specified branch; no arbitrary commands executed.

## Troubleshooting

- **Git Errors**: Ensure Git is installed (`sudo apt install git`) and the repo path is valid. Check server logs for `exec` errors.  
- **Tar Creation Fails**: Verify the repository exists and permissions allow archiving.  
- **Port in Use**: Change `PORT` in `.env`.  
- **Missing Env Vars**: Server exits on startup if required vars are unset—check console output.  
- **Invalid Repo**: Make sure the `repo` query parameter is one of the paths in `GIT_REPO_PATHS`.

## License

MIT License. Feel free to use and modify.
