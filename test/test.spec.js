import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/server.js'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

vi.hoisted(() => {
  // Set environment variables before importing server.js
  process.env.PORT = '3000'
  process.env.HOST = '127.0.0.1'
  process.env.GIT_REPO_PATH = process.cwd()
  process.env.BRANCH_NAME = 'main'
  process.env.SRC_FOLDER = 'src'
  process.env.TOKEN = 'test-token'
})

// Ensure dotenv doesn't override our settings (mock it to do nothing if .env exists)
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(() => ({}))
  }
}))

const repoPath = process.cwd()

describe('Git Repo Source Server', () => {
  beforeAll(async () => {
    // Ensure src folder exists with a test file
    const srcDir = path.join(repoPath, 'src')
    await fs.mkdir(srcDir, { recursive: true })
    const testFile = path.join(srcDir, 'test.txt')
    await fs.writeFile(testFile, 'hello world')
    console.log('Test src folder prepared')
  })

  afterEach(async () => {
    // Clean up any created tar.gz files
    try {
      const files = await fs.readdir(repoPath)
      for (const file of files) {
        if (file.startsWith('src-') && file.endsWith('.tar.gz')) {
          await fs.rm(path.join(repoPath, file))
          console.log(`Cleaned up ${file}`)
        }
      }
    } catch (err) {
      console.warn('Cleanup warning:', err.message)
    }
  })

  afterAll(async () => {
    // Optional: remove test file if desired, but keep for repo
    // await fs.rm(path.join(repoPath, 'src', 'test.txt'));
  })

  describe('GET /health', () => {
    it('should return OK status', async () => {
      const res = await request(app).get('/health')
      expect(res.status).toBe(200)
      expect(res.text).toBe('OK')
    })
  })

  describe('GET /src', () => {
    it('should return 401 without auth header', async () => {
      const res = await request(app).get('/src')
      expect(res.status).toBe(401)
      expect(res.text).toBe('Unauthorized')
    })

    it('should return 401 with invalid auth header', async () => {
      const res = await request(app).get('/src').set('auth', 'wrong-token')
      expect(res.status).toBe(401)
      expect(res.text).toBe('Unauthorized')
    })

    describe('with valid auth', () => {
      const validAuth = { auth: 'test-token' }

      it('should create tar if not exists and serve it', async () => {
        // Get current hash to predict tar name
        const { stdout: hashOutput } = await execAsync(`git -C ${repoPath} rev-parse HEAD`)
        const gitHash = hashOutput.trim().substring(0, 7)
        const tarFileName = `src-${gitHash}.tar.gz`
        const tarFilePath = path.join(repoPath, tarFileName)

        // Force creation by removing if exists
        try {
          await fs.rm(tarFilePath)
        } catch {}

        const res = await request(app).get('/src').set(validAuth)

        expect(res.status).toBe(200)
        expect(res.header['content-type']).toBe('application/gzip')
        expect(res.header['content-disposition']).toContain('attachment')
        expect(parseInt(res.header['content-length'] || '0')).toBeGreaterThan(0)

        // Verify file was created
        await fs.access(tarFilePath)

        // Verify content includes the test file
        const { stdout: tarList } = await execAsync(`tar -tzf "${tarFilePath}"`)
        expect(tarList).toContain('src/test.txt')
      })

      it('should serve existing tar without recreating', async () => {
        // Get current hash
        const { stdout: hashOutput } = await execAsync(`git -C ${repoPath} rev-parse HEAD`)
        const gitHash = hashOutput.trim().substring(0, 7)
        const tarFileName = `src-${gitHash}.tar.gz`
        const tarFilePath = path.join(repoPath, tarFileName)

        // Pre-create the tar
        await execAsync(`cd ${repoPath} && tar -czf ${tarFileName} src`)

        const res = await request(app).get('/src').set(validAuth)

        expect(res.status).toBe(200)
        expect(res.header['content-type']).toBe('application/gzip')
        expect(parseInt(res.header['content-length'] || '0')).toBeGreaterThan(0)

        // Verify file still exists (not recreated, but served)
        await fs.access(tarFilePath)

        // Verify content
        const { stdout: tarList } = await execAsync(`tar -tzf "${tarFilePath}"`)
        expect(tarList).toContain('src/test.txt')
      })

      it('should return 500 on git error', async () => {
        // Temporarily set invalid repo path to trigger error
        const originalPath = process.env.GIT_REPO_PATH
        process.env.GIT_REPO_PATH = '/nonexistent/path'

        const res = await request(app).get('/src').set(validAuth)
        expect(res.status).toBe(500)
        expect(res.text).toBe('Internal Server Error')

        // Restore
        process.env.GIT_REPO_PATH = originalPath
      })
    })
  })
})
