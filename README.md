# NimRequest

Ask anyone to pay you back — for a bill, a gig, or a delivery — with proof, in one tap.

Built for the Nimiq Mini Apps Competition, Cycle II.

## The problem

Money owed between people doesn't move because the systems around it don't force it to:
- Friends don't pay each other back because asking is awkward
- Freelancers finish work and then have to hope they get paid
- Buyers don't want to pay upfront for something not yet delivered, and sellers don't want to deliver before getting paid

## How it works

NimRequest has two settlement modes under one system:

**Simple debt (instant):** Create a request, the payer taps once and pays directly from their own wallet.

**Held until confirmed (escrow):** The payer's funds are held in the app's escrow wallet until both sides confirm the work or delivery is complete, then it releases automatically. If no dispute is raised before the deadline, it auto-releases.

Every settled request comes with a public "Show proof of settlement" view: real timestamps and a real, checkable Nimiq blockchain transaction hash.

## Tech stack

- Backend: Node.js (zero external dependencies beyond @nimiq/core)
- Nimiq integration: @nimiq/core for wallet management and on-chain transactions
- Frontend: Single-page HTML/CSS/JS client
- Network: Nimiq Testnet

## Running it locally

cd server
npm install
node server.js

Then open client/index.html in a browser.

## License

MIT
