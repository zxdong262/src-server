import express from 'express'
import dotenv from 'dotenv'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000
const host = process.env.HOST || '127.0.0.1'
const GIT_REPO_PATH = process.env.GIT_REPO_PATH
const BRANCH_NAME = process.env.BRANCH_NAME
const SRC_FOLDER = process.env.SRC_FOLDER
const TOKEN = process.env.TOKEN

if (!GIT_REPO_PATH || !BRANCH_NAME || !SRC_FOLDER || !TOKEN) {
  console.error('Missing GIT_REPO_PATH, BRANCH_NAME, SRC_FOLDER, or TOKEN in environment variables')
  process.exit(1)
}

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
    // Fetch latest from origin
    await execAsync(`git -C ${GIT_REPO_PATH} fetch origin`)

    // Check git status
    const { stdout: statusOutput } = await execAsync(`git -C ${GIT_REPO_PATH} status`)
    const isUpToDate = statusOutput.includes(`Your branch is up to date with 'origin/${BRANCH_NAME}'`)

    if (!isUpToDate) {
      console.log('Repo not in sync, pulling...')
      await execAsync(`git -C ${GIT_REPO_PATH} pull origin ${BRANCH_NAME}`)
    }

    // Get current git hash
    const { stdout: hashOutput } = await execAsync(`git -C ${GIT_REPO_PATH} rev-parse HEAD`)
    const gitHash = hashOutput.trim().substring(0, 7) // Abbrev hash
    const tarFileName = `src-${gitHash}.tar.gz`
    const tarFilePath = path.join(GIT_REPO_PATH, tarFileName)

    // Check if tar file exists
    try {
      await fs.access(tarFilePath)
      console.log('Tar file already exists, serving...')
    } catch {
      console.log('Creating tar file...')
      // Tar the specified folder (could be '.' for whole repo or a subfolder)
      await execAsync(`cd ${GIT_REPO_PATH} && tar -czf ${tarFileName} ${SRC_FOLDER}`)
    }

    // Serve the file
    res.download(tarFilePath)
  } catch (error) {
    console.error('Error in /src route:', error)
    res.status(500).send('Internal Server Error')
  }
})

app.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}`)
})
