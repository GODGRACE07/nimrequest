import { Client, ClientConfiguration, KeyPair, TransactionBuilder, Address } from '@nimiq/core'
import { readFileSync } from 'fs'

let clientInstance = null

async function getClient() {
  if (clientInstance) return clientInstance
  const config = new ClientConfiguration()
  config.network('testalbatross')
  config.seedNodes([
    '/dns4/seed1.pos.nimiq-testnet.com/tcp/8443/wss',
    '/dns4/seed2.pos.nimiq-testnet.com/tcp/8443/wss',
  ])
  config.syncMode('pico')
  config.logLevel('error')
  clientInstance = await Client.create(config.build())
  await clientInstance.waitForConsensusEstablished()
  return clientInstance
}

function getEscrowKeyPair() {
  const savedKeyHex = readFileSync('escrow-wallet-key.txt', 'utf-8').trim()
  return KeyPair.fromHex(savedKeyHex)
}

export async function payoutWinner(recipientAddressString, amountInNim) {
  const client = await getClient()
  const escrowKeyPair = getEscrowKeyPair()
  const escrowAddress = escrowKeyPair.toAddress()
  const recipientAddress = Address.fromString(recipientAddressString)

  const networkId = await client.getNetworkId()
  const headHeight = await client.getHeadHeight()

  const amountInLuna = BigInt(Math.round(amountInNim * 1e5))
  const feeInLuna = 0n

  const transaction = TransactionBuilder.newBasic(
    escrowAddress,
    recipientAddress,
    amountInLuna,
    feeInLuna,
    headHeight,
    networkId
  )

  transaction.sign(escrowKeyPair, undefined)

  console.log('📤 Sending payout:', amountInNim, 'NIM to', recipientAddressString)
  const receipt = await client.sendTransaction(transaction)
  console.log('✅ Payout sent! Details:', receipt)

  return receipt
}