/// <reference types="vite/client" />

interface Window {
  ethereum?: import('viem').EIP1193Provider
}

declare const __WARROOM_GAME_ADDRESS__: string
declare const __WAR_TOKEN_ADDRESS__: string
declare const __TREASURY_ADDRESS__: string
declare const __ADMIN_ADDRESS__: string

interface Document {
  readonly modelContext?: {
    registerTool(tool: {
      name: string
      title?: string
      description: string
      inputSchema: Record<string, unknown>
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
      execute(input: unknown): unknown | Promise<unknown>
    }, options?: { signal?: AbortSignal }): void | Promise<void>
  }
}
