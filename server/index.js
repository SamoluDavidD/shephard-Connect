import { createApp } from "./app.js"
import { createPool } from "./db.js"

const port = Number(process.env.API_PORT || 3000)
const pool = createPool()
const app = createApp({ pool })
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`ShepherdConnect API listening on port ${port}`)
})

async function shutdown() {
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
