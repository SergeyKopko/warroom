import fs from 'node:fs'
import path from 'node:path'
import solc from 'solc'

const root = process.cwd()
const entry = 'contracts/WarroomGame.sol'

function findImports(importPath) {
  const candidates = [
    path.join(root, importPath),
    path.join(root, 'node_modules', importPath),
  ]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  return found ? { contents: fs.readFileSync(found, 'utf8') } : { error: `File not found: ${importPath}` }
}

const input = {
  language: 'Solidity',
  sources: { [entry]: { content: fs.readFileSync(path.join(root, entry), 'utf8') } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }))
const errors = (output.errors || []).filter((item) => item.severity === 'error')
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage)
  process.exit(1)
}

const artifact = output.contracts[entry].WarroomGame
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true })
fs.writeFileSync(
  path.join(root, 'artifacts', 'WarroomGame.json'),
  JSON.stringify({ contractName: 'WarroomGame', abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` }, null, 2),
)
console.log('Compiled contracts/WarroomGame.sol → artifacts/WarroomGame.json')
