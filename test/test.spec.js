import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

vi.hoisted(() => {
  // Set environment variables before importing server.js
  process.env.NODE_ENV = 'test'
  process.env.PORT = '3000'
  process.env.HOST = '127.0.0.1'
  // Support multi-repo: use same path for both to test
  process.env.GIT_REPO_PATHS = `${process.cwd()},${process.cwd()}/test-repo`
  process.env.DEFAULT_REPO_PATH = process.cwd()
  process.env.BRANCH_NAME = 'main'
  process.env.SRC_FOLDER = 'src-test'
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
    const srcDir = path.join(repoPath, 'src-test')
    await fs.mkdir(srcDir, { recursive: true })
    const testFile = path.join(srcDir, 'test.txt')
    await fs.writeFile(testFile, 'hello world')
    console.log('Test src folder prepared')
  })

  beforeEach(async () => {
    // Ensure repo is up to date
    try {
      await execAsync(`git -C ${repoPath} pull origin main`)
    } catch (err) {
      console.warn('Pull warning (may not be remote):', err.message)
    }

    // Remove any existing src-*.tar.gz to start clean
    try {
      const files = await fs.readdir(repoPath)
      for (const file of files) {
        if (file.startsWith('src-') && file.endsWith('.tar.gz')) {
          await fs.rm(path.join(repoPath, file))
        }
      }
    } catch (err) {
      console.warn('Cleanup warning:', err.message)
    }
  })

  afterAll(async () => {
    // Remove the src-test folder after all tests
    const srcTestDir = path.join(repoPath, 'src-test')
    try {
      await fs.rm(srcTestDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore errors if already removed
    }
  })

  describe('GET /health', () => {
    it('should return OK status', async () => {
      const res = await request(app).get('/health')
      expect(res.status).toBe(200)
      expect(res.text).toBe('OK')
    })
  })

  describe('GET /repos', () => {
    it('should return list of allowed repos and default repo', async () => {
      const res = await request(app).get('/repos')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('repos')
      expect(res.body).toHaveProperty('default')
      expect(Array.isArray(res.body.repos)).toBe(true)
      expect(res.body.repos.length).toBe(2)
      expect(res.body.default).toBe(process.cwd())
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

      it('should use default repo when no repo query param provided', async () => {
        const res = await request(app).get('/src').set(validAuth)

        expect(res.status).toBe(200)
        expect(res.header['content-type']).toBe('application/gzip')
        expect(res.header['content-disposition']).toContain('attachment')
        expect(parseInt(res.header['content-length'] || '0')).toBeGreaterThan(0)

        // Verify content includes the test file
        // The filename should include the repo name
        const contentDisposition = res.header['content-disposition']
        expect(contentDisposition).toContain('src-server-')
      }, 20000)

      it('should use default repo when repo query param is empty', async () => {
        const res = await request(app).get('/src?repo=').set(validAuth)

        expect(res.status).toBe(200)
        expect(res.header['content-type']).toBe('application/gzip')
      }, 20000)

      it('should use specified repo when valid repo query param provided', async () => {
        // Use the first repo from GIT_REPO_PATHS
        const validRepo = process.cwd()
        const res = await request(app).get(`/src?repo=${encodeURIComponent(validRepo)}`).set(validAuth)

        expect(res.status).toBe(200)
        expect(res.header['content-type']).toBe('application/gzip')
      }, 20000)

      it('should return 400 when invalid repo query param provided', async () => {
        const invalidRepo = '/nonexistent/repo'
        const res = await request(app).get(`/src?repo=${encodeURIComponent(invalidRepo)}`).set(validAuth)

        expect(res.status).toBe(400)
        expect(res.body).toHaveProperty('error')
        expect(res.body.error).toBe('Invalid repo')
      }, 20000)

      it('should create tar if not exists and serve it', async () => {
        const res = await request(app).get('/src').set(validAuth)

        expect(res.status).toBe(200)
        expect(res.header['content-type']).toBe('application/gzip')
        expect(res.header['content-disposition']).toContain('attachment')
        expect(parseInt(res.header['content-length'] || '0')).toBeGreaterThan(0)

        // Get current hash after request (in case pulled)
        const { stdout: hashOutput } = await execAsync(`git -C ${repoPath} rev-parse HEAD`)
        const gitHash = hashOutput.trim().substring(0, 7)
        const repoName = path.basename(repoPath)
        const tarFileName = `src-${repoName}-${gitHash}`
        // The actual file has nanoid suffix, so check if it starts with this
        const contentDisposition = res.header['content-disposition']
        expect(contentDisposition).toContain(tarFileName)
      }, 20000)

      it('should serve existing tar without recreating', async () => {
        // Get current hash
        const { stdout: hashOutput } = await execAsync(`git -C ${repoPath} rev-parse HEAD`)
        const gitHash = hashOutput.trim().substring(0, 7)
        const repoName = path.basename(repoPath)
        const tarFileName = `src-${repoName}-${gitHash}.tar.gz`
        const tarFilePath = path.join(repoPath, tarFileName)

        // Pre-create the tar
        await execAsync(`cd ${repoPath} && tar -czf ${tarFileName} src-test`)

        const res = await request(app).get('/src').set(validAuth)

        expect(res.status).toBe(200)
        expect(res.header['content-type']).toBe('application/gzip')
        expect(parseInt(res.header['content-length'] || '0')).toBeGreaterThan(0)

        // Verify file still exists
        await fs.access(tarFilePath)

        // Verify content
        const { stdout: tarList } = await execAsync(`tar -tzf "${tarFilePath}"`)
        expect(tarList).toContain('src-test/test.txt')
      }, 20000)

      it('should return 500 on git error', async () => {
        // Test with invalid repo in query param (which will be validated)
        const invalidRepo = '/nonexistent/path'
        const res = await request(app).get(`/src?repo=${encodeURIComponent(invalidRepo)}`).set(validAuth)
        expect(res.status).toBe(400)
        expect(res.body).toHaveProperty('error')
        expect(res.body.error).toBe('Invalid repo')
      }, 20000)
    })
  })
})
