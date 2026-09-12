import { KeyPair } from '@nimiq/core'
import { writeFileSync } from 'fs'

// Run this ONCE. Never run it again — doing so creates a NEW wallet
// and abandons any funds already sent to the old one.
const keyPair = KeyPair.generate()
const address = keyPair.toAddress()

console.log('🏦 Escrow wallet created!')
console.log('📍 Address:', address.toUserFriendlyAddress())
console.log('⚠️  Saving private key to escrow-wallet-key.txt — keep this SECRET')

writeFileSync('escrow-wallet-key.txt', keyPair.toHex())