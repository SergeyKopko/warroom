import type { EIP1193Provider } from 'viem'

type AnnouncedProvider = EIP1193Provider & {
  isMetaMask?: boolean
  isRabby?: boolean
}

type ProviderContainer = AnnouncedProvider & {
  providers?: AnnouncedProvider[]
}

/**
 * Browser extensions may all inject into window.ethereum. Prefer MetaMask when
 * it is installed, then Rabby, and keep the selected provider for the complete
 * transaction flow so connect and write requests cannot go to different wallets.
 */
export function getInjectedProvider(): EIP1193Provider | undefined {
  const injected = window.ethereum as ProviderContainer | undefined
  if (!injected) return undefined
  const providers = injected.providers?.length ? injected.providers : [injected]
  return providers.find((provider) => provider.isMetaMask && !provider.isRabby)
    ?? providers.find((provider) => provider.isRabby)
    ?? providers[0]
}
