import crypto from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const DATA_FILE = process.env.DATA_DIR ? `${process.env.DATA_DIR}/requests-data.json` : 'requests-data.json'
const USERS_FILE = process.env.DATA_DIR ? `${process.env.DATA_DIR}/known-users.json` : 'known-users.json'
const CLAIMS_FILE = process.env.DATA_DIR ? `${process.env.DATA_DIR}/name-claims.json` : 'name-claims.json'

function loadPersisted() {
  if (!existsSync(DATA_FILE)) return new Map()
  try { return new Map(JSON.parse(readFileSync(DATA_FILE, 'utf-8'))) }
  catch (err) { console.error('Failed to load requests:', err.message); return new Map() }
}
function loadUsers() {
  if (!existsSync(USERS_FILE)) return new Set()
  try { return new Set(JSON.parse(readFileSync(USERS_FILE, 'utf-8'))) } catch { return new Set() }
}
function loadClaims() {
  if (!existsSync(CLAIMS_FILE)) return new Map()
  try { return new Map(JSON.parse(readFileSync(CLAIMS_FILE, 'utf-8'))) } catch { return new Map() }
}

const requests = loadPersisted()
const knownUsers = loadUsers()
const nameClaims = loadClaims()

export function persist() {
  try { writeFileSync(DATA_FILE, JSON.stringify(Array.from(requests.entries()))) }
  catch (err) { console.error('Failed to persist requests:', err.message) }
}
function persistUsers() {
  try { writeFileSync(USERS_FILE, JSON.stringify(Array.from(knownUsers))) }
  catch (err) { console.error('Failed to persist users:', err.message) }
}
function persistClaims() {
  try { writeFileSync(CLAIMS_FILE, JSON.stringify(Array.from(nameClaims.entries()))) }
  catch (err) { console.error('Failed to persist claims:', err.message) }
}

function normalizeId(id) { return String(id || '').trim().toLowerCase() }
function trackUser(id) {
  const n = normalizeId(id)
  if (!n) return
  knownUsers.add(n)
  persistUsers()
}
function newId() { return crypto.randomBytes(8).toString('hex') }

export function claimOrVerifyIdentity(id, address) {
  const normalized = normalizeId(id)
  const existing = nameClaims.get(normalized)
  if (!existing) { nameClaims.set(normalized, address); persistClaims(); return { ok: true } }
  if (existing === address) return { ok: true }
  return { ok: false, error: `"${id}" is already in use by a different wallet. Pick a different name.` }
}

export function createRequest({ type, fromId, fromAddress, toId, toAddress, amount, description, deadlineHours }) {
  fromId = normalizeId(fromId)
  toId = normalizeId(toId)
  trackUser(fromId)
  trackUser(toId)

  const id = newId()
  const request = {
    id, type, fromId, fromAddress, toId, toAddress, amount, description,
    status: 'pending', createdAt: Date.now(), fundedAt: null,
    confirmedByFrom: false, confirmedByTo: false,
    deadlineAt: deadlineHours ? Date.now() + deadlineHours * 60 * 60 * 1000 : null,
    settledAt: null, txHash: null, disputeNote: null, payoutError: null,
  }
  requests.set(id, request)
  persist()
  return request
}

export function getRequest(id) { return requests.get(id) }

export function markFunded(id) {
  const r = requests.get(id); if (!r) return null
  r.status = 'funded'; r.fundedAt = Date.now(); persist(); return r
}
export function markSettled(id, txHash) {
  const r = requests.get(id); if (!r) return null
  r.status = 'settled'; r.settledAt = Date.now(); r.txHash = txHash; r.payoutError = null; persist(); return r
}
export function markDisputed(id, note) {
  const r = requests.get(id); if (!r) return null
  r.status = 'disputed'; r.disputeNote = note; persist(); return r
}

export function getRequestsForUser(userId) {
  userId = normalizeId(userId)
  return Array.from(requests.values()).filter(r => r.fromId === userId || r.toId === userId)
}
export function getSettleStreak(userId) {
  userId = normalizeId(userId)
  const settled = Array.from(requests.values())
    .filter(r => r.toId === userId && r.status === 'settled')
    .sort((a, b) => b.settledAt - a.settledAt).slice(0, 4)
  return settled.map(r => ({
    requestId: r.id,
    hoursToSettle: (r.settledAt - r.createdAt) / (1000 * 60 * 60),
    prompt: (r.settledAt - r.createdAt) / (1000 * 60 * 60) <= 48,
  }))
}
export function getOverdueUnconfirmed() {
  const now = Date.now()
  return Array.from(requests.values()).filter(r => r.type === 'escrow' && r.status === 'funded' && r.deadlineAt && now > r.deadlineAt)
}
export function getFailedPayouts() {
  return Array.from(requests.values()).filter(r =>
    (r.type === 'instant' && r.status === 'pending' && r.payoutError) ||
    (r.type === 'escrow' && r.status === 'funded' && r.confirmedByFrom && r.confirmedByTo)
  )
}
export function getUserCount() { return knownUsers.size }
export function getAllUsers() { return Array.from(knownUsers) }
export { normalizeId }