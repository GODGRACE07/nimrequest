// ============================================================
// NimRequest — data.js
// Persists to a local JSON file so request data survives
// server restarts. Simple file storage — swap for a real
// database (e.g. Supabase/Postgres) before scaling beyond
// a hackathon demo.
// ============================================================

import crypto from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const DATA_FILE = 'requests-data.json'

function loadPersisted() {
  if (!existsSync(DATA_FILE)) return new Map()
  try {
    const raw = readFileSync(DATA_FILE, 'utf-8')
    const entries = JSON.parse(raw)
    return new Map(entries)
  } catch (err) {
    console.error('Failed to load persisted requests, starting fresh:', err.message)
    return new Map()
  }
}

const requests = loadPersisted()

export function persist() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(Array.from(requests.entries())))
  } catch (err) {
    console.error('Failed to persist requests:', err.message)
  }
}

function newId() {
  return crypto.randomBytes(8).toString('hex')
}

export function createRequest({ type, fromId, fromAddress, toId, toAddress, amount, description, deadlineHours }) {
  const id = newId()
  const request = {
    id,
    type,
    fromId, fromAddress,
    toId, toAddress,
    amount,
    description,
    status: 'pending',
    createdAt: Date.now(),
    fundedAt: null,
    confirmedByFrom: false,
    confirmedByTo: false,
    deadlineAt: deadlineHours ? Date.now() + deadlineHours * 60 * 60 * 1000 : null,
    settledAt: null,
    txHash: null,
    disputeNote: null,
    payoutError: null,
  }
  requests.set(id, request)
  persist()
  return request
}

export function getRequest(id) {
  return requests.get(id)
}

export function markFunded(id) {
  const r = requests.get(id)
  if (!r) return null
  r.status = 'funded'
  r.fundedAt = Date.now()
  persist()
  return r
}

export function markSettled(id, txHash) {
  const r = requests.get(id)
  if (!r) return null
  r.status = 'settled'
  r.settledAt = Date.now()
  r.txHash = txHash
  persist()
  return r
}

export function markDisputed(id, note) {
  const r = requests.get(id)
  if (!r) return null
  r.status = 'disputed'
  r.disputeNote = note
  persist()
  return r
}

export function getRequestsForUser(userId) {
  return Array.from(requests.values()).filter(r => r.fromId === userId || r.toId === userId)
}

export function getSettleStreak(userId) {
  const settled = Array.from(requests.values())
    .filter(r => r.toId === userId && r.status === 'settled')
    .sort((a, b) => b.settledAt - a.settledAt)
    .slice(0, 4)

  return settled.map(r => {
    const hoursToSettle = (r.settledAt - r.createdAt) / (1000 * 60 * 60)
    return { requestId: r.id, hoursToSettle, prompt: hoursToSettle <= 48 }
  })
}

export function getOverdueUnconfirmed() {
  const now = Date.now()
  return Array.from(requests.values()).filter(
    r => r.type === 'escrow' && r.status === 'funded' && r.deadlineAt && now > r.deadlineAt
  )
}