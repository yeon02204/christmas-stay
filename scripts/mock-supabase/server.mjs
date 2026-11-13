// ⚠️ 로컬 테스트 전용 Supabase 대역 서버.
// 실제 Supabase 를 대신해 supabase-js 가 호출하는 아래 엔드포인트만 흉내 낸다.
//   POST /auth/v1/token, GET /auth/v1/user, POST /auth/v1/logout
//   POST /rest/v1/rpc/:fn          → 실제 PostgreSQL 함수를 authenticated 역할 + JWT claims 로 실행 (RLS 그대로 적용)
//   POST/DELETE /storage/v1/object  → storage.objects 에 RLS 로 기록 + 로컬 디스크 저장
//   GET  /storage/v1/object/public  → 파일 제공
// 배포용이 아니며, 실제 서비스에서는 Supabase 프로젝트를 사용한다.

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import Busboy from 'busboy'

const PORT = Number(process.env.MOCK_PORT || 54321)
const SECRET = 'local-mock-secret'
const PASSWORD = process.env.MOCK_PASSWORD || 'test1234'
const STORAGE_DIR = path.resolve(process.env.MOCK_STORAGE_DIR || '.mock-storage')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/cs_test' })

const b64url = (buf) => Buffer.from(buf).toString('base64url')
function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
function verifyJwt(token) {
  const [h, b, s] = String(token || '').split('.')
  if (!h || !b || !s) return null
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url')
  if (sig !== s) return null
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString())
  if (payload.exp && payload.exp < Date.now() / 1000) return null
  return payload
}

const refreshTokens = new Map()
function issueSession(user) {
  const now = Math.floor(Date.now() / 1000)
  const access_token = signJwt({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 })
  const refresh_token = crypto.randomBytes(16).toString('hex')
  refreshTokens.set(refresh_token, user)
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(user) }
}
const userJson = (u) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: u.created_at,
})

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', '*')
}
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type })
  res.end(body === undefined ? '' : type === 'application/json' ? JSON.stringify(body) : body)
}
async function readJson(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString()
  return raw ? JSON.parse(raw) : {}
}
function authUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /i, '')
  const p = verifyJwt(token)
  return p?.role === 'authenticated' ? p : null
}

async function asUser(claims, fn, role = 'authenticated') {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims ? JSON.stringify(claims) : ''])
    await client.query(`set local role ${role === 'anon' ? 'anon' : 'authenticated'}`)
    const r = await fn(client)
    await client.query('commit')
    return r
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

const fnCache = new Map()
async function fnSignature(name) {
  if (fnCache.has(name)) return fnCache.get(name)
  const { rows } = await pool.query(
    `select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) t) as types
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1 and left(p.proname, 1) <> '_'`,
    [name],
  )
  const sig = rows[0] || null
  fnCache.set(name, sig)
  return sig
}

function pgError(res, e) {
  const status = e.code === '42501' ? 403 : e.code === 'P0404' ? 404 : e.code === 'P0409' ? 409 : 400
  send(res, status, { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null })
}

async function handleRpc(req, res, name) {
  const user = authUser(req)
  // 실제 Supabase 처럼: 로그인 토큰 없이 anon 키만 보내면 anon 역할로 실행 (권한은 DB 가 판단)
  const bearer = (req.headers.authorization || '').replace(/^Bearer /i, '')
  const anon = !user && (!bearer || bearer === req.headers.apikey || bearer.split('.').length !== 3)
  if (!user && !anon) return send(res, 401, { code: 'PGRST301', message: 'JWT expired' })
  const sig = await fnSignature(name)
  if (!sig) return send(res, 404, { code: 'PGRST202', message: `function ${name} not found` })
  const body = await readJson(req)
  const names = sig.names || []
  const args = []
  const params = []
  names.forEach((n, i) => {
    if (!(n in body)) return
    const type = sig.types[i]
    params.push(type === 'jsonb' ? JSON.stringify(body[n]) : body[n])
    args.push(`${n} => $${params.length}::${type}`)
  })
  try {
    const rows = await asUser(user, (c) => c.query(`select public.${name}(${args.join(', ')}) as result`, params), anon ? 'anon' : 'authenticated')
    send(res, 200, rows.rows[0]?.result ?? null)
  } catch (e) {
    pgError(res, e)
  }
}

async function bucketConfig(id) {
  const { rows } = await pool.query('select * from storage.buckets where id = $1', [id])
  return rows[0]
}

function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || ''
    if (!ct.startsWith('multipart/form-data')) {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve({ buffer: Buffer.concat(chunks), mime: ct }))
      return
    }
    const bb = Busboy({ headers: req.headers })
    let file = null
    bb.on('file', (_n, stream, info) => {
      const chunks = []
      stream.on('data', (c) => chunks.push(c))
      stream.on('end', () => (file = { buffer: Buffer.concat(chunks), mime: info.mimeType }))
    })
    bb.on('close', () => (file ? resolve(file) : reject(new Error('no file'))))
    bb.on('error', reject)
    req.pipe(bb)
  })
}

async function handleUpload(req, res, bucket, objectPath) {
  const user = authUser(req)
  if (!user) return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'JWT required' })
  const cfg = await bucketConfig(bucket)
  if (!cfg) return send(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' })
  const file = await parseUpload(req)
  if (cfg.file_size_limit && file.buffer.length > Number(cfg.file_size_limit))
    return send(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' })
  if (cfg.allowed_mime_types?.length && !cfg.allowed_mime_types.includes(file.mime))
    return send(res, 415, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${file.mime} is not supported` })
  try {
    await asUser(user, (c) =>
      c.query('insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3)', [
        bucket, objectPath, JSON.stringify({ mimetype: file.mime, size: file.buffer.length }),
      ]),
    )
  } catch (e) {
    const status = e.code === '42501' ? 403 : e.code === '23505' ? 409 : 400
    return send(res, status, { statusCode: String(status), error: e.code, message: e.message })
  }
  const dest = path.join(STORAGE_DIR, bucket, objectPath)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, file.buffer)
  fs.writeFileSync(`${dest}.mime`, file.mime)
  send(res, 200, { Key: `${bucket}/${objectPath}`, Id: crypto.randomUUID() })
}

async function handleDelete(req, res, bucket) {
  const user = authUser(req)
  if (!user) return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'JWT required' })
  const { prefixes = [] } = await readJson(req)
  try {
    const r = await asUser(user, (c) =>
      c.query('delete from storage.objects where bucket_id = $1 and name = any($2) returning name', [bucket, prefixes]),
    )
    for (const row of r.rows) {
      const p = path.join(STORAGE_DIR, bucket, row.name)
      fs.rmSync(p, { force: true })
      fs.rmSync(`${p}.mime`, { force: true })
    }
    send(res, 200, r.rows.map((x) => ({ name: x.name, bucket_id: bucket })))
  } catch (e) {
    send(res, 400, { statusCode: '400', error: e.code, message: e.message })
  }
}

function handlePublic(res, bucket, objectPath) {
  const p = path.join(STORAGE_DIR, bucket, objectPath)
  if (!p.startsWith(STORAGE_DIR) || !fs.existsSync(p)) return send(res, 404, { message: 'Object not found' })
  const mime = fs.existsSync(`${p}.mime`) ? fs.readFileSync(`${p}.mime`, 'utf8') : 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'max-age=3600' })
  fs.createReadStream(p).pipe(res)
}

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') return send(res, 204)
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const p = decodeURIComponent(url.pathname)
  try {
    if (p === '/auth/v1/token' && req.method === 'POST') {
      const body = await readJson(req)
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const user = refreshTokens.get(body.refresh_token)
        if (!user) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
        refreshTokens.delete(body.refresh_token)
        return send(res, 200, issueSession(user))
      }
      const { rows } = await pool.query('select id, email, created_at from auth.users where lower(email) = lower($1)', [body.email || ''])
      if (!rows[0] || body.password !== PASSWORD)
        return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return send(res, 200, issueSession(rows[0]))
    }
    if (p === '/auth/v1/user' && req.method === 'GET') {
      const u = authUser(req)
      if (!u) return send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' })
      const { rows } = await pool.query('select id, email, created_at from auth.users where id = $1', [u.sub])
      return rows[0] ? send(res, 200, userJson(rows[0])) : send(res, 404, { msg: 'User not found' })
    }
    if (p === '/auth/v1/logout') return send(res, 204)
    let m
    if ((m = p.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)) && req.method === 'POST') return await handleRpc(req, res, m[1])
    if ((m = p.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)) && req.method === 'GET') return handlePublic(res, m[1], m[2])
    if ((m = p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)) && (req.method === 'POST' || req.method === 'PUT'))
      return await handleUpload(req, res, m[1], m[2])
    if ((m = p.match(/^\/storage\/v1\/object\/([^/]+)$/)) && req.method === 'DELETE') return await handleDelete(req, res, m[1])
    send(res, 404, { message: `mock: ${req.method} ${p} not implemented` })
  } catch (e) {
    console.error(e)
    send(res, 500, { message: String(e.message || e) })
  }
})

server.listen(PORT, () => console.log(`[mock-supabase] http://localhost:${PORT}  (storage: ${STORAGE_DIR})`))
