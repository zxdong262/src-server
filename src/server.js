import { app } from './app.js'

const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '127.0.0.1'

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`)
  })
}
