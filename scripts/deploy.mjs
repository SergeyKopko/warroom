import fs from 'node:fs'
import { createPublicClient, createWalletClient, getAddress, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const required = ['PRIVATE_KEY', 'WAR_TOKEN_ADDRESS', 'TREASURY_ADDRESS', 'ADMIN_ADDRESS']
const missing = required.filter((key) => !process.env[key])
if (missing.length) throw new Error(`Missing deployment values: ${missing.join(', ')}`)

const chain = {
  id: Number(process.env.CHAIN_ID || 4663),
  name: process.env.CHAIN_ID === '46630' ? 'Robinhood Chain Testnet' : 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RH_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'] } },
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY)
const transport = http(chain.rpcUrls.default.http[0])
const publicClient = createPublicClient({ chain, transport })
const walletClient = createWalletClient({ account, chain, transport })
const artifact = JSON.parse(fs.readFileSync(new URL('../artifacts/WarroomGame.json', import.meta.url), 'utf8'))

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [
    getAddress(process.env.WAR_TOKEN_ADDRESS),
    getAddress(process.env.PLTR_TOKEN_ADDRESS || '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A'),
    getAddress(process.env.TREASURY_ADDRESS),
    getAddress(process.env.PONS_FEE_ESCROW || '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e'),
    getAddress(process.env.ADMIN_ADDRESS),
  ],
})
console.log(`Deployment submitted: ${hash}`)
const receipt = await publicClient.waitForTransactionReceipt({ hash })
console.log(`WARROOM deployed: ${receipt.contractAddress}`)
