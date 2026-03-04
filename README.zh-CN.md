[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![JavaScript](https://img.shields.io/badge/JavaScript-ESM-yellow?style=flat-square&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Express](https://img.shields.io/badge/Express-5.x-orange?style=flat-square&logo=express)](https://expressjs.com)
[![Vitest](https://img.shields.io/badge/Vitest-testing-blue?style=flat-square&logo=vitest)](https://vitest.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | [中文](README.zh-CN.md)

# Git 仓库源码服务器

一个简单的 Node.js Express 服务器，用于从 Git 仓库中提供指定文件夹的 tar.gz 归档文件。如果本地仓库与远程 origin 不同步，服务器会自动从指定分支拉取最新更改。访问通过基于令牌的身份验证标头进行保护。

## 功能特性

- **多仓库支持**：配置多个 Git 仓库，并使用 `repo` 查询参数从任意仓库提供服务。
- **自动 Git 同步**：在提供服务前从远程 origin 拉取最新更改。
- **按需归档**：仅为当前提交哈希不存在时创建 `src-{仓库名}-{git哈希}.tar.gz` 归档文件。
- **安全访问**：需要 `/src` 端点的匹配 `auth` 标头令牌。
- **健康检查**：简单的 `/health` 端点用于监控。
- **仓库发现**： `/repos` 端点列出可用仓库。
- **ESM 格式**：现代 ES 模块，提供更好的性能和树摇功能。

## 前提条件

- Node.js 18+（支持 ESM）
- 服务器上安装 Git
- Linux 服务器

## 使用方法

1. 克隆此仓库：

```sh
git clone http://github.com/zxdong262/src-server.git
# 或 git clone git@github.com:zxdong262/src-server.git
cd src-server
```

2. 安装依赖：

```sh
npm install
```

3. 在项目根目录创建 `.env` 文件并配置所需的环境变量（见下文）。

4. 启动服务器：

```sh
node server.js
```

   生产环境建议使用进程管理器如 PM2：

```sh
npm install -g pm2
pm2 start server.js --name "git-repo-server"
```

## 环境变量

创建 `.env` 文件，包含以下内容：

| 变量名                | 描述                                                           | 必填 | 示例                                         |
|----------------------|---------------------------------------------------------------|------|---------------------------------------------|
| `HOST`              | 服务器主机（绑定地址，如 0.0.0.0 或 127.0.0.1）              | 否   | `127.0.0.1`                                 |
| `PORT`              | 服务器端口                                                     | 否   | `3000`                                      |
| `GIT_REPO_PATHS`    | 允许的 Git 仓库路径列表（逗号分隔）                           | 是   | `/home/user/repo1,/home/user/repo2`         |
| `DEFAULT_REPO_PATH` | 默认仓库路径（必须是 GIT_REPO_PATHS 之一）                  | 是   | `/home/user/repo1`                          |
| `BRANCH_NAME`       | 要跟踪和拉取的 Git 分支                                       | 是   | `main`                                      |
| `SRC_FOLDER`        | 要归档的文件夹（`.` 表示整个仓库）                           | 是   | `/home/user/repo1/src` 或 `/home/user/repo1` |
| `TOKEN`             | `/src` 认证的密钥令牌（GitHub secret）                      | 是   | `your-super-secret-token`                   |

**注意**：
- `GIT_REPO_PATHS` 接受多个逗号分隔的路径（逗号周围不要有空格）。
- `DEFAULT_REPO_PATH` 必须是 `GIT_REPO_PATHS` 中的路径之一。

示例 `.env`：

```env
HOST=127.0.0.1
PORT=3000
GIT_REPO_PATHS=/home/ubuntu/repo1,/home/ubuntu/repo2
DEFAULT_REPO_PATH=/home/ubuntu/repo1
BRANCH_NAME=main
SRC_FOLDER=src
TOKEN=mysecret
```

**注意**：确保 `GIT_REPO_PATHS` 中的 Git 仓库已经克隆并初始化。服务器用户必须对这些路径具有读/写权限，并对 Git 具有执行权限。

## 使用方法

使用 `node server.js` 启动服务器。服务器将在指定端口（默认：3000）上监听。

### 路由

- **GET `/health`**  
  健康检查端点。如果服务器正在运行则返回 `OK`。无需认证。

- **GET `/repos`**  
  返回包含允许的仓库列表和默认仓库的 JSON 对象。无需认证。
  ```json
  {
    "repos": ["/path/to/repo1", "/path/to/repo2"],
    "default": "/path/to repo1"
  }
  ```

- **GET `/src`**  
  提供 `src-{仓库名}-{git哈希}.tar.gz` 文件。  
  - **认证**：需要与 `TOKEN` 匹配的 `auth` 标头。  
  - **查询参数**：
    - `repo`（可选）：指定要使用的仓库。必须是 `GIT_REPO_PATHS` 之一。如果未提供，则使用 `DEFAULT_REPO_PATH`。  
  - **行为**：  
    1. 验证仓库参数（如果提供）。  
    2. 从 origin 拉取最新。  
    3. 检查本地分支是否最新；如果不是则拉取。  
    4. 获取当前提交哈希（缩短为 7 个字符）。  
    5. 如果该哈希不存在则创建 `SRC_FOLDER` 的 tar.gz。  
    6. 下载文件。  
  - **响应**：成功返回 200 并下载文件；无效；认证失败返回 401；其他错误返回 500。

### 示例请求（使用 curl仓库返回 400）

```bash
# 使用默认仓库
curl -H "auth: mysecret" http://localhost:3000/src -o src-archive.tar.gz

# 使用指定仓库
curl -H "auth: mysecret" "http://localhost:3000/src?repo=/home/ubuntu/repo2" -o src-archive.tar.gz
```

## 安全说明

- **令牌认证**：在自定义 `auth` 标头中使用简单的 bearer 令牌。将 `TOKEN` 存储为 GitHub Actions secret。  
- **建议使用 HTTPS**：在生产环境中强制使用 HTTPS 以防止令牌被拦截。使用带 Let's Encrypt 的 Nginx 反向代理。  
- **限制**：这是基本认证，适用于服务器到服务器（如 CI/CD）。如需公开访问，请考虑使用 JWT 或 API 密钥。定期轮换令牌。  
- **Git 安全**：仅从指定分支拉取；不执行任意命令。

## 故障排除

- **Git 错误**：确保已安装 Git（`sudo apt install git`）且仓库路径有效。检查服务器日志中的 `exec` 错误。  
- **tar 创建失败**：验证 `SRC_FOLDER` 存在于仓库中且权限允许归档。  
- **端口被占用**：在 `.env` 中更改 `PORT`。  
- **缺少环境变量**：如果未设置必填变量，服务器会在启动时退出——检查控制台输出。  
- **无效仓库**：确保 `repo` 查询参数是 `GIT_REPO_PATHS` 中的路径之一。

## 许可证

MIT 许可证。随意使用和修改。
