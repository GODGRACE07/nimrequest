import { KeyPair } from '@nimiq/core'

const keyPair = KeyPair.generate()
const address = keyPair.toAddress()

console.log('🎯 Test address:', address.toUserFriendlyAddress())