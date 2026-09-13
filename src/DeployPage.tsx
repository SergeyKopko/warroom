import { useMemo, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  getAddress,
  http,
  type Abi,
  type Address,
  type Hex,
} from 'viem'
import artifact from '../artifacts/WarroomGame.json'
import { CONTRACTS, EXPLORER, robinhood } from './config'
import { getInjectedProvider } from './wallet'

const METADATA_BASE_URI = 'https://www.war-room.tech/api/metadata/'

function short(address?: string) {
  return address ? `${address.slice(0, 8)}…${address.slice(-6)}` : '—'
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/rejected|denied/i.test(message)) return 'Transaction was rejected in the wallet.'
  if (/insufficient funds/i.test(message)) return 'This wallet does not have enough ETH for deployment gas.'
  return message.split('\n')[0].slice(0, 220)
}

export default function DeployPage() {
  const [account, setAccount] = useState<Address>()
  const [balance, setBalance] = useState<bigint>(0n)
  const [txHash, setTxHash] = useState<Hex>()
  const [contractAddress, setContractAddress] = useState<Address>()
  const [blockNumber, setBlockNumber] = useState<bigint>()
  const [status, setStatus] = useState('Connect the admin wallet to prepare deployment.')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const admin = useMemo(() => __ADMIN_ADDRESS__ ? getAddress(__ADMIN_ADDRESS__) : undefined, [])
  const treasury = useMemo(() => __TREASURY_ADDRESS__ ? getAddress(__TREASURY_ADDRESS__) : undefined, [])
  const publicClient = useMemo(() => createPublicClient({ chain: robinhood, transport: http() }), [])
  const ready = Boolean(admin && treasury && CONTRACTS.war !== '0x0000000000000000000000000000000000000000')
  const correctWallet = Boolean(account && admin && account.toLowerCase() === admin.toLowerCase())

  const walletClient = async () => {
    const provider = getInjectedProvider()
    if (!provider) throw new Error('Install Robinhood Wallet, MetaMask or another EVM wallet.')
    const wallet = createWalletClient({ chain: robinhood, transport: custom(provider) })
    const [nextAccount] = await wallet.requestAddresses()
    if (await wallet.getChainId() !== robinhood.id) {
      try {
        await wallet.switchChain({ id: robinhood.id })
      } catch {
        await wallet.addChain({ chain: robinhood })
        await wallet.switchChain({ id: robinhood.id })
      }
    }
    setAccount(nextAccount)
    setBalance(await publicClient.getBalance({ address: nextAccount }))
    return createWalletClient({ account: nextAccount, chain: robinhood, transport: custom(provider) })
  }

  const connect = async () => {
    setError(undefined)
    try {
      await walletClient()
      setStatus('Wallet connected. Review every constructor address before signing.')
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const deploy = async () => {
    if (!ready || !admin || !treasury) return
    setBusy(true)
    setError(undefined)
    try {
      const wallet = await walletClient()
      if (wallet.account.address.toLowerCase() !== admin.toLowerCase()) throw new Error(`Connect the configured admin wallet ${admin}.`)
      setStatus('Confirm the WARROOM deployment transaction in your wallet.')
      const hash = await wallet.deployContract({
        abi: artifact.abi as Abi,
        bytecode: artifact.bytecode as Hex,
        args: [CONTRACTS.war, CONTRACTS.pltr, treasury, CONTRACTS.ponsFeeEscrow, admin, METADATA_BASE_URI],
      })
      setTxHash(hash)
      setStatus('Deployment submitted. Waiting for an on-chain receipt…')
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (!receipt.contractAddress) throw new Error('Deployment receipt did not contain a contract address.')
      setContractAddress(receipt.contractAddress)
      setBlockNumber(receipt.blockNumber)
      localStorage.setItem('warroom-mainnet-deployment', JSON.stringify({ contractAddress: receipt.contractAddress, blockNumber: receipt.blockNumber.toString(), txHash: hash }))
      setStatus('WARROOM deployed. Save the contract address and deployment block shown below.')
    } catch (caught) {
      setError(errorMessage(caught))
      setStatus('Deployment was not completed.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="deploy-shell">
    <section className="deploy-card">
      <span className="eyebrow">WARROOM · ROBINHOOD CHAIN 4663</span>
      <h1>Contract deployment</h1>
      <p className="deploy-warning">This console sends a real mainnet transaction only after you press Deploy and confirm it in your wallet. Never enter a seed phrase or private key.</p>
      <div className="deploy-grid">
        <span>Admin / owner</span><b>{admin || 'Missing'}</b>
        <span>Treasury · receives 50% WAR</span><b>{treasury || 'Missing'}</b>
        <span>WAR token</span><b>{CONTRACTS.war}</b>
        <span>Tokenized PLTR</span><b>{CONTRACTS.pltr}</b>
        <span>Pons Fee Escrow</span><b>{CONTRACTS.ponsFeeEscrow}</b>
        <span>NFT metadata</span><b>{METADATA_BASE_URI}</b>
      </div>
      <div className="deploy-wallet"><span>Connected wallet</span><b>{short(account)}</b><small>{formatEther(balance)} ETH</small></div>
      <p className="deploy-status">{status}</p>
      {error && <p className="deploy-error">{error}</p>}
      {!account
        ? <button className="btn btn-lg btn-amber btn-block" onClick={() => void connect()}>Connect admin wallet</button>
        : <button className="btn btn-lg btn-amber btn-block" disabled={!ready || !correctWallet || busy || Boolean(contractAddress)} onClick={() => void deploy()}>{busy ? 'Waiting for wallet / receipt…' : correctWallet ? 'Deploy WARROOM to mainnet' : `Switch to ${short(admin)}`}</button>}
      {txHash && <a className="deploy-link" href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer">View deployment transaction</a>}
      {contractAddress && <div className="deploy-result"><span>WARROOM_GAME_ADDRESS</span><b>{contractAddress}</b><span>DEPLOYMENT_BLOCK</span><b>{blockNumber?.toString()}</b></div>}
      <a className="deploy-back" href="/">← Back to WARROOM</a>
    </section>
  </main>
}
