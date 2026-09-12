import { parseAbi } from 'viem'

export const erc20Abi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function symbol() view returns (string)',
])

export const gameAbi = parseAbi([
  'function war() view returns (address)',
  'function pltr() view returns (address)',
  'function totalSupply() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function targetHp() view returns (uint256)',
  'function TARGET_MAX_HP() view returns (uint256)',
  'function targetCycle() view returns (uint256)',
  'function totalWarBurned() view returns (uint256)',
  'function totalLaunches() view returns (uint256)',
  'function currentRoundId() view returns (uint256)',
  'function currentRoundEndsAt() view returns (uint256)',
  'function currentRoundWeight() view returns (uint256)',
  'function rankPopulation(uint8 rank) view returns (uint256)',
  'function ownedTokens(address owner) view returns (uint256[])',
  'function getCommander(uint256 tokenId) view returns ((uint8 rank,uint8 missileLevel,uint32 hits,uint32 launches,uint64 mintedAt,uint64 lastLaunchAt,uint32 extraDay,uint8 extraCount,uint32 activeRound,uint256 totalDamage,uint256 warSpent,uint256 warBurned))',
  'function creatorFeesAvailable() view returns (uint256)',
  'function claimableRewards(uint256 tokenId, uint256[] roundIds) view returns (uint256)',
  'function mint(uint256 quantity)',
  'function launch(uint256 tokenId, bool paid)',
  'function upgradeMissile(uint256 tokenId)',
  'function buyNextRank(uint256 tokenId)',
  'function promoteWithProgress(uint256 tokenId)',
  'function enterGeneralTrial(uint256 tokenId)',
  'function closeRound()',
  'function claimRewards(uint256 tokenId, uint256[] roundIds)',
  'function claimRewardsBatch(uint256[] tokenIds, uint256[] roundIds)',
  'event CommanderMinted(uint256 indexed tokenId, address indexed owner, uint256 paid, uint256 burned)',
  'event MissileLaunched(uint256 indexed tokenId, address indexed owner, bool paid, bool hit, uint256 damage, uint256 cycle)',
  'event MissileUpgraded(uint256 indexed tokenId, uint8 level, uint256 paid, uint256 burned)',
  'event RankUpgraded(uint256 indexed tokenId, uint8 rank, bool purchased, uint256 paid, uint256 burned)',
  'event RoundClosed(uint256 indexed roundId, uint256 reward, uint256 totalWeight, address indexed closer, uint256 closerFee)',
  'event RewardsClaimed(uint256 indexed tokenId, address indexed owner, uint256 amount)',
])

export const ponsEscrowAbi = parseAbi([
  'function balanceOfToken(address recipient, address token) view returns (uint256)',
  'function claimToken(address token)',
])
