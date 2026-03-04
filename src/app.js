import express from 'express'
import dotenv from 'dotenv'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { nanoid } from 'nanoid'

// Load environment variables from .env file
dotenv.config()

const app = express()
const tempFolder = os.tmpdir()

// Parse GIT_REPO_PATHS - comma-separated list of allowed repo paths
const gitRepoPathsStr = process.env.GIT_REPO_PATHS || ''
const GIT_REPO_PATHS = gitRepoPathsStr
  .split(',')
  .map(p => p.trim())
  .filter(p => p.length > 0)

const DEFAULT_REPO_PATH = process.env.DEFAULT_REPO_PATH?.trim() || ''

// Validate configuration
const requiredEnvVars = ['GIT_REPO_PATHS', 'DEFAULT_REPO_PATH', 'BRANCH_NAME', 'TOKEN']
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key])

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`)
  process.exit(1)
}

// Validate DEFAULT_REPO_PATH is in GIT_REPO_PATHS
if (!GIT_REPO_PATHS.includes(DEFAULT_REPO_PATH)) {
  console.error(`DEFAULT_REPO_PATH (${DEFAULT_REPO_PATH}) must be one of GIT_REPO_PATHS (${GIT_REPO_PATHS.join(', ')})`)
  process.exit(1)
}

function checkFileExists (filePath) {
  return fs.access(filePath).then(() => true).catch(() => false)
}

const { BRANCH_NAME, TOKEN } = process.env

const execAsync = promisify(exec)

app.get('/health', (req, res) => {
  res.status(200).send('OK')
})

// Get list of available repos
app.get('/repos', (req, res) => {
  res.status(200).json({
    repos: GIT_REPO_PATHS,
    default: DEFAULT_REPO_PATH
  })
})

app.get('/src', async (req, res) => {
  const authHeader = req.headers.auth
  if (!authHeader || authHeader !== TOKEN) {
    return res.status(401).send('Unauthorized')
  }

  try {
    // Get repo from query param or use default
    const requestedRepo = req.query.repo?.trim()

    // Validate repo parameter
    let repoPath
    if (requestedRepo) {
      if (!GIT_REPO_PATHS.includes(requestedRepo)) {
        return res.status(400).json({
          error: 'Invalid repo',
          message: `Repo must be one of: ${GIT_REPO_PATHS.join(', ')}`
        })
      }
      repoPath = requestedRepo
    } else {
      repoPath = DEFAULT_REPO_PATH
    }

    // Fetch latest from origin
    await execAsync(`git -C ${repoPath} fetch origin`)

    // Check git status
    const { stdout: statusOutput } = await execAsync(`git -C ${repoPath} status`)
    const isUpToDate = statusOutput.includes(`Your branch is up to date with 'origin/${BRANCH_NAME}'`)

    if (!isUpToDate) {
      console.log('Repo not in sync, pulling...')
      await execAsync(`git -C ${repoPath} pull origin ${BRANCH_NAME}`)
    }

    // Get current git hash
    const { stdout: hashOutput } = await execAsync(`git -C ${repoPath} rev-parse HEAD`)
    const gitHash = hashOutput.trim().substring(0, 7) // Abbrev hash

    // Include repo identifier in filename to avoid conflicts
    const repoName = path.basename(repoPath)
    const tarFileName = `src-${repoName}-${gitHash}-${nanoid()}.tar.gz`
    const tarFilePath = path.join(tempFolder, tarFileName)

    // Check if tar file exists
    const exist = await checkFileExists(tarFilePath)
    if (exist) {
      await fs.unlink(tarFilePath)
    }
    // Archive the entire repo
    await execAsync(`tar -czf ${tarFilePath} -C ${repoPath} .`)

    // Serve the file
    res.download(tarFilePath)
  } catch (error) {
    console.error('Error in /src route:', error)
    res.status(500).send('Internal Server Error')
  }
})

export { app }
