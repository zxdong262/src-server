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
const requiredEnvVars = ['GIT_REPO_PATH', 'BRANCH_NAME', 'SRC_FOLDER', 'TOKEN']
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key])

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`)
  process.exit(1)
}

function checkFileExists (filePath) {
  return fs.access(filePath).then(() => true).catch(() => false)
}

const { BRANCH_NAME, SRC_FOLDER, TOKEN } = process.env

const execAsync = promisify(exec)

app.get('/health', (req, res) => {
  res.status(200).send('OK')
})

app.get('/src', async (req, res) => {
  const authHeader = req.headers.auth
  if (!authHeader || authHeader !== TOKEN) {
    return res.status(401).send('Unauthorized')
  }

  try {
    const repoPath = process.env.GIT_REPO_PATH

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
    const tarFileName = `src-${gitHash}-${nanoid()}.tar.gz`
    const tarFilePath = path.join(tempFolder, tarFileName)

    // Check if tar file exists
    const exist = await checkFileExists(tarFilePath)
    if (exist) {
      await fs.unlink(tarFilePath)
    }
    const parentFolder = path.dirname(SRC_FOLDER)
    const baseFolder = path.basename(SRC_FOLDER)
    await execAsync(`tar -czf ${tarFilePath} -C ${parentFolder} ${baseFolder}`)

    // Serve the file
    res.download(tarFilePath)
  } catch (error) {
    console.error('Error in /src route:', error)
    res.status(500).send('Internal Server Error')
  }
})

export { app }
