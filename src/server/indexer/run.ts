import { createPublicClient, webSocket } from 'viem'
import { getServerEnv } from '../env.js'
import { RealtimeIndexerSupervisor } from './service.js'
import { catchUpActivity } from './catchup.js'

const env = getServerEnv()
const chain = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [env.rpcHttp] } },
} as const
let pollTimer: ReturnType<typeof setInterval> | undefined
const startPollingFallback = () => {
  if (pollTimer) return
  pollTimer = setInterval(() => void catchUpActivity().catch((error) => console.error('Indexer poll failed', error)), 4_000)
}

const supervisor = new RealtimeIndexerSupervisor({
  catchUp: () => catchUpActivity(),
  connect: async (onBlock) => {
    if (!env.rpcWs) {
      startPollingFallback()
      throw new Error('ROBINHOOD_RPC_WS is not configured')
    }
    const wsClient = createPublicClient({ chain, transport: webSocket(env.rpcWs, { reconnect: false }) })
    return await new Promise<() => void>((resolve, reject) => {
      let opened = false
      const unsubscribe = wsClient.watchBlockNumber({
        emitOnBegin: true,
        onBlockNumber: () => {
          if (!opened) {
            opened = true
            if (pollTimer) clearInterval(pollTimer)
            pollTimer = undefined
            resolve(unsubscribe)
          }
          onBlock()
        },
        onError: (error) => {
          startPollingFallback()
          if (!opened) reject(error)
          else {
            unsubscribe()
            void supervisor.run()
          }
        },
      })
      setTimeout(() => {
        if (!opened) {
          unsubscribe()
          startPollingFallback()
          reject(new Error('WebSocket connection timeout'))
        }
      }, 10_000)
    })
  },
})

process.on('SIGINT', () => { supervisor.stop(); if (pollTimer) clearInterval(pollTimer); process.exit(0) })
process.on('SIGTERM', () => { supervisor.stop(); if (pollTimer) clearInterval(pollTimer); process.exit(0) })

await supervisor.run()
console.log(`WARROOM Activity indexer is following ${env.gameAddress}`)
