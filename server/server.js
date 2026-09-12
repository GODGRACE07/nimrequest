// ============================================================
// NimRequest — server.js
// Testnet only. Zero external dependencies beyond @nimiq/core.
// Request data now persists to disk across restarts.
// ============================================================

import http from 'http'
import { KeyPair } from '@nimiq/core'
import { payoutWinner } from './payout.js'
import {
  createRequest,
  getRequest,
  markFunded,
  markSettled,
  markDisputed,
  getRequestsForUser,
  getSettleStreak,
  getOverdueUnconfirmed,
  persist,
} from './data.js'

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => (body += chunk))
    req.on('end', () => {
      if (!body) return resolve({})
      try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON body')) }
    })
    req.on('error', reject)
  })
}

async function handleGenerateWallet(req, res) {
  const keyPair = KeyPair.generate()
  const address = keyPair.toAddress()

  try {
    await fetch('https://faucet.pos.nimiq-testnet.com/tapit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: address.toUserFriendlyAddress(),
        withStackingContract: false,
      }),
    })
  } catch (err) {
    console.error('Faucet request failed:', err.message)
  }

  sendJson(res, 200, {
    address: address.toUserFriendlyAddress(),
    privateKeyHex: keyPair.toHex(),
  })
}

async function handleTopUp(req, res) {
  const { address } = await readBody(req)
  if (!address) return sendJson(res, 400, { error: 'address required' })

  try {
    await fetch('https://faucet.pos.nimiq-testnet.com/tapit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, withStackingContract: false }),
    })
    sendJson(res, 200, { ok: true, message: 'Test NIM is on its way!' })
  } catch (err) {
    sendJson(res, 500, { error: 'Faucet request failed: ' + err.message })
  }
}

async function handleCreate(req, res) {
  const { type, fromId, fromAddress, toId, toAddress, amount, description, deadlineHours } = await readBody(req)
  if (!type || !fromId || !fromAddress || !toId || !toAddress || !amount) {
    return sendJson(res, 400, { error: 'Missing required fields' })
  }
  if (!['instant', 'escrow'].includes(type)) {
    return sendJson(res, 400, { error: 'type must be "instant" or "escrow"' })
  }
  const request = createRequest({ type, fromId, fromAddress, toId, toAddress, amount, description, deadlineHours })
  sendJson(res, 200, { request })
}

async function handleConfirmInstant(req, res, requestId) {
  const { txHash } = await readBody(req)
  const request = getRequest(requestId)
  if (!request) return sendJson(res, 404, { error: 'Request not found' })
  if (request.type !== 'instant') return sendJson(res, 400, { error: 'Not an instant request' })
  const updated = markSettled(requestId, txHash)
  sendJson(res, 200, { request: updated })
}

async function handleFundEscrow(req, res, requestId) {
  const request = getRequest(requestId)
  if (!request) return sendJson(res, 404, { error: 'Request not found' })
  if (request.type !== 'escrow') return sendJson(res, 400, { error: 'Not an escrow request' })
  const updated = markFunded(requestId)
  sendJson(res, 200, { request: updated })
}

async function handleConfirm(req, res, requestId) {
  const { confirmerId } = await readBody(req)
  const request = getRequest(requestId)
  if (!request) return sendJson(res, 404, { error: 'Request not found' })
  if (request.status !== 'funded') return sendJson(res, 400, { error: 'Request is not in a confirmable state' })

  if (confirmerId === request.fromId) request.confirmedByFrom = true
  else if (confirmerId === request.toId) request.confirmedByTo = true
  else return sendJson(res, 403, { error: 'confirmerId not part of this request' })

  persist() // save the partial confirmation immediately, even before both sides confirm

  if (request.confirmedByFrom && request.confirmedByTo) {
    try {
      const receipt = await payoutWinner(request.fromAddress, request.amount)
      markSettled(request.id, receipt.transactionHash)
    } catch (err) {
      request.payoutError = err.message
      persist()
    }
  }

  sendJson(res, 200, { request })
}

async function handleDispute(req, res, requestId) {
  const { note } = await readBody(req)
  const request = getRequest(requestId)
  if (!request) return sendJson(res, 404, { error: 'Request not found' })
  const updated = markDisputed(requestId, note || 'No details provided')
  sendJson(res, 200, { request: updated })
}

function handleGetRequest(req, res, requestId) {
  const request = getRequest(requestId)
  if (!request) return sendJson(res, 404, { error: 'Request not found' })
  sendJson(res, 200, { request })
}

function handleGetUserRequests(req, res, userId) {
  sendJson(res, 200, { requests: getRequestsForUser(userId), streak: getSettleStreak(userId) })
}

setInterval(async () => {
  const overdue = getOverdueUnconfirmed()
  for (const request of overdue) {
    try {
      const receipt = await payoutWinner(request.fromAddress, request.amount)
      markSettled(request.id, receipt.transactionHash)
      console.log('⏰ Auto-released overdue escrow request', request.id)
    } catch (err) {
      console.error('Auto-release failed for', request.id, ':', err.message)
    }
  }
}, 60 * 1000)

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 200, {})
  const url = new URL(req.url, `http://${req.headers.host}`)
  const parts = url.pathname.split('/').filter(Boolean)

  try {
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'wallet' && parts[2] === 'generate') {
      return await handleGenerateWallet(req, res)
    }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'wallet' && parts[2] === 'topup') {
      return await handleTopUp(req, res)
    }
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'requests' && parts.length === 2) {
      return await handleCreate(req, res)
    }
    if (req.method === 'POST' && parts[3] === 'confirm-instant') return await handleConfirmInstant(req, res, parts[2])
    if (req.method === 'POST' && parts[3] === 'fund') return await handleFundEscrow(req, res, parts[2])
    if (req.method === 'POST' && parts[3] === 'confirm') return await handleConfirm(req, res, parts[2])
    if (req.method === 'POST' && parts[3] === 'dispute') return await handleDispute(req, res, parts[2])
    if (req.method === 'GET' && parts[1] === 'requests' && parts.length === 3) return handleGetRequest(req, res, parts[2])
    if (req.method === 'GET' && parts[1] === 'users' && parts.length === 3) return handleGetUserRequests(req, res, parts[2])
    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    sendJson(res, 500, { error: err.message })
  }
})

const PORT = process.env.PORT || 3002
server.listen(PORT, () => {
  console.log(`NimRequest server running on port ${PORT}`)
})

export default server