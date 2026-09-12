import fs from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import solc from 'solc'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPublicClient, createWalletClient, defineChain, http, maxUint256, parseEther, type Abi, type Address, type Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'

type Artifact = { abi: Abi; bytecode: Hex }

const localChain = defineChain({
  id: 1337,
  name: 'WARROOM local tests',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1'] } },
})
const burnAddress = '0x000000000000000000000000000000000000dEaD' as Address

function compileContracts() {
  const root = process.cwd()
  const sources = Object.fromEntries([
    'contracts/WarroomGame.sol',
    'contracts/test/MockERC20.sol',
    'contracts/test/MockPonsFeeEscrow.sol',
  ].map((name) => [name, { content: fs.readFileSync(path.join(root, name), 'utf8') }]))
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  }), {
    import(importPath: string) {
      const candidates = [path.join(root, importPath), path.join(root, 'node_modules', importPath)]
      const found = candidates.find((candidate) => fs.existsSync(candidate))
      return found ? { contents: fs.readFileSync(found, 'utf8') } : { error: `Missing ${importPath}` }
    },
  }))
  const errors = (output.errors || []).filter((entry: { severity: string }) => entry.severity === 'error')
  if (errors.length) throw new Error(errors.map((entry: { formattedMessage: string }) => entry.formattedMessage).join('\n'))
  const artifact = (file: string, name: string): Artifact => ({
    abi: output.contracts[file][name].abi,
    bytecode: `0x${output.contracts[file][name].evm.bytecode.object}`,
  })
  return {
    game: artifact('contracts/WarroomGame.sol', 'WarroomGame'),
    erc20: artifact('contracts/test/MockERC20.sol', 'MockERC20'),
    escrow: artifact('contracts/test/MockPonsFeeEscrow.sol', 'MockPonsFeeEscrow'),
  }
}

describe('WarroomGame WAR spending', () => {
  let artifacts: ReturnType<typeof compileContracts>
  let anvil: ChildProcessWithoutNullStreams
  let rpcUrl: string
  let accounts: PrivateKeyAccount[]
  let publicClient: ReturnType<typeof createPublicClient>
  let war: Address
  let game: Address
  let treasury: Address
  let player: Address

  beforeAll(async () => {
    artifacts = compileContracts()
    const port = 18_545 + process.pid % 1_000
    rpcUrl = `http://127.0.0.1:${port}`
    anvil = spawn(path.join(process.cwd(), 'node_modules', '.bin', 'anvil'), [
      '--port', String(port),
      '--chain-id', '1337',
      '--hardfork', 'cancun',
      '--accounts', '5',
      '--balance', '1000000',
      '--mnemonic-random',
    ])
    let output = ''
    let errors = ''
    anvil.stdout.on('data', (chunk) => { output += String(chunk) })
    anvil.stderr.on('data', (chunk) => { errors += String(chunk) })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) })
        const privateKeys = [...output.matchAll(/\(\d+\)\s+(0x[a-f0-9]{64})/gi)].map((match) => match[1] as Hex)
        if (response.ok && privateKeys.length >= 5) {
          accounts = privateKeys.slice(0, 5).map((privateKey) => privateKeyToAccount(privateKey))
          ready = true
          break
        }
      } catch { /* Anvil is still starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    if (!ready) throw new Error(`Anvil failed to start: ${errors}`)
    publicClient = createPublicClient({ chain: localChain, transport: http(rpcUrl), pollingInterval: 10 })
  }, 30_000)

  afterAll(() => { anvil?.kill('SIGTERM') })

  beforeEach(async () => {
    const [admin] = accounts
    player = accounts[1].address
    treasury = accounts[2].address
    const wallet = createWalletClient({ account: admin, chain: localChain, transport: http(rpcUrl) })

    const deploy = async (artifact: Artifact, args: readonly unknown[] = []) => {
      const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args })
      const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 10 })
      if (!receipt.contractAddress) throw new Error('Deployment did not return an address')
      return receipt.contractAddress
    }

    war = await deploy(artifacts.erc20, ['Local WAR', 'WAR'])
    const pltr = await deploy(artifacts.erc20, ['Local PLTR', 'PLTR'])
    const escrow = await deploy(artifacts.escrow)
    game = await deploy(artifacts.game, [war, pltr, treasury, escrow, admin.address, 'https://warroom.example/api/metadata/'])

    const mintHash = await wallet.writeContract({ address: war, abi: artifacts.erc20.abi, functionName: 'mint', args: [player, parseEther('2000000')] })
    await publicClient.waitForTransactionReceipt({ hash: mintHash, pollingInterval: 10 })
    const playerWallet = createWalletClient({ account: accounts[1], chain: localChain, transport: http(rpcUrl) })
    const approvalHash = await playerWallet.writeContract({ address: war, abi: artifacts.erc20.abi, functionName: 'approve', args: [game, maxUint256] })
    await publicClient.waitForTransactionReceipt({ hash: approvalHash, pollingInterval: 10 })
  })

  it('mints NFTs and splits every WAR payment 50% burn / 50% treasury', async () => {
    const wallet = createWalletClient({ account: accounts[1], chain: localChain, transport: http(rpcUrl) })
    const writeGame = async (functionName: string, args: readonly unknown[]) => {
      const hash = await wallet.writeContract({ address: game, abi: artifacts.game.abi, functionName, args })
      const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 10 })
      expect(receipt.status).toBe('success')
    }
    const balance = (address: Address) => publicClient.readContract({ address: war, abi: artifacts.erc20.abi, functionName: 'balanceOf', args: [address] }) as Promise<bigint>

    await writeGame('mint', [1n])
    expect(await publicClient.readContract({ address: game, abi: artifacts.game.abi, functionName: 'ownerOf', args: [1n] })).toBe(player)
    expect(await publicClient.readContract({ address: game, abi: artifacts.game.abi, functionName: 'tokenURI', args: [1n] })).toBe('https://warroom.example/api/metadata/1')
    expect(await balance(burnAddress)).toBe(parseEther('50000'))
    expect(await balance(treasury)).toBe(parseEther('50000'))
    expect(await publicClient.readContract({ address: game, abi: artifacts.game.abi, functionName: 'totalWarBurned' })).toBe(parseEther('50000'))

    await writeGame('launch', [1n, true])
    expect(await balance(burnAddress)).toBe(parseEther('55000'))
    expect(await balance(treasury)).toBe(parseEther('55000'))

    await writeGame('buyNextRank', [1n])
    expect(await balance(burnAddress)).toBe(parseEther('180000'))
    expect(await balance(treasury)).toBe(parseEther('180000'))

    await writeGame('mint', [2n])
    expect(await publicClient.readContract({ address: game, abi: artifacts.game.abi, functionName: 'totalSupply' })).toBe(3n)
    expect(await balance(burnAddress)).toBe(parseEther('280000'))
    expect(await balance(treasury)).toBe(parseEther('280000'))
  }, 30_000)

  it('allows a free launch without WAR and enforces its cooldown', async () => {
    const wallet = createWalletClient({ account: accounts[1], chain: localChain, transport: http(rpcUrl) })
    const send = async (functionName: string, args: readonly unknown[]) => {
      const hash = await wallet.writeContract({ address: game, abi: artifacts.game.abi, functionName, args })
      const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 10 })
      if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted`)
      return receipt
    }
    await send('mint', [1n])
    const before = await publicClient.readContract({ address: war, abi: artifacts.erc20.abi, functionName: 'balanceOf', args: [player] })
    await send('launch', [1n, false])
    expect(await publicClient.readContract({ address: war, abi: artifacts.erc20.abi, functionName: 'balanceOf', args: [player] })).toBe(before)
    await expect(send('launch', [1n, false])).rejects.toThrow()
  }, 30_000)
})
