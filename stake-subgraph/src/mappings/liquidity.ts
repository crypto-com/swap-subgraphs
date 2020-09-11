import { log, Address, BigDecimal, ethereum } from "@graphprotocol/graph-ts"
import {
  Factory,
  Pair,
  Staking,
  Stake,
  LiquidityProvider,
  LiquidityPosition,
  StakingSnapshot,
  RewardPositionSnapshot
} from '../types/schema'
import {
  ZERO_BD,
  ONE_BD,
  STAKING_ID,
  FACTORY_ADDRESS,
  convertTimestampToNextHourStartUnix
} from './helpers'

export let MINIMUM_REWARD_POOL = BigDecimal.fromString('1000000')
export let REWARD_POOL_PERCENTAGE = BigDecimal.fromString('0.001')

export function createLiquidityProvider(wallet: Address): LiquidityProvider {
  let address = wallet.toHexString()
  let liquidityProvider = LiquidityProvider.load(address)
  if (liquidityProvider == null) {
    liquidityProvider = new LiquidityProvider(address)
    liquidityProvider.address = address

    liquidityProvider.liquidityPositions = []
    liquidityProvider.totalLiquidityProvidedETH = ZERO_BD
    liquidityProvider.totalLiquidityProvidedUSD = ZERO_BD

    liquidityProvider.totalTokenStaked = ZERO_BD
    liquidityProvider.totalTokenStakedUSD = ZERO_BD

    liquidityProvider.share = ZERO_BD
    liquidityProvider.factorA = ONE_BD
    liquidityProvider.factorB = ZERO_BD
    liquidityProvider.crops = ZERO_BD
    liquidityProvider.reward = ZERO_BD

    liquidityProvider.save()

    let staking = Staking.load(STAKING_ID)
    let providers = staking.liquidityProviders
    providers.push(address)
    staking.liquidityProviders = providers
    staking.save()
  }

  if (liquidityProvider == null) log.error('LiquidityProvider is null', [address])
  return liquidityProvider as LiquidityProvider
}

export function createLiquidityPosition(pair: Address, provider: Address): LiquidityPosition {
  let id = pair
    .toHexString()
    .concat('-')
    .concat(provider.toHexString())
  let liquidityPosition = LiquidityPosition.load(id)
  if (liquidityPosition == null) {
    liquidityPosition = new LiquidityPosition(id)
    liquidityPosition.pair = pair.toHexString()
    liquidityPosition.provider = provider.toHexString()
    liquidityPosition.reserveETH = ZERO_BD
    liquidityPosition.reserveUSD = ZERO_BD
    liquidityPosition.liquidityTokenBalance = ZERO_BD
    liquidityPosition.totalSupply = ZERO_BD
    liquidityPosition.liquidityProvidedETH = ZERO_BD
    liquidityPosition.liquidityProvidedUSD = ZERO_BD
    liquidityPosition.save()

    let pair = Pair.load(pair.toHexString())
    let pairPositions = pair.liquidityPositions
    if (pairPositions.indexOf(id) == -1) {
      pairPositions.push(id)
      pair.liquidityPositions = pairPositions
      pair.save()
    }

    let provider = LiquidityProvider.load(provider.toHexString())
    let providerPositions = provider.liquidityPositions
    if (providerPositions.indexOf(id) == -1) {
      providerPositions.push(id)
      provider.liquidityPositions = providerPositions
      provider.save()
    }
  }

  if (liquidityPosition == null) log.error('LiquidityPosition is null', [id])
  return liquidityPosition as LiquidityPosition
}

export function updateLPCrops(lp: LiquidityProvider, staking: Staking): void {
  // No liquidity provided, no rewards
  if (lp.totalLiquidityProvidedUSD.equals(ZERO_BD) || lp.totalTokenStaked.equals(ZERO_BD)) {
    lp.share = ZERO_BD
    lp.factorA = ONE_BD
    lp.crops = ZERO_BD

    return
  }

  // Factory not even there, global no liquidity
  let factory = Factory.load(FACTORY_ADDRESS)
  if (factory == null) {
    lp.share = ZERO_BD
    lp.factorA = ONE_BD
    lp.crops = ZERO_BD

    return
  }

  if (factory.totalLiquidityUSD.equals(ZERO_BD)) {
    lp.share = ZERO_BD
  } else {
    lp.share = lp.totalLiquidityProvidedUSD.div(factory.totalLiquidityUSD)
  }

  // factorB is calculated in handleStaked and should be saved

  staking.totalCrops = staking.totalCrops.minus(lp.crops)
  lp.crops = lp.share.times(lp.factorA).times(lp.factorB).times(MINIMUM_REWARD_POOL)
  staking.totalCrops = staking.totalCrops.plus(lp.crops)

  lp.save()
  staking.save()
}

export function updateReward(lp: LiquidityProvider, staking: Staking): void {
  if (staking.totalCrops.equals(ZERO_BD)) {
    lp.reward = ZERO_BD
    return
  }

  let rewardPool = staking.totalTokenStaked.times(REWARD_POOL_PERCENTAGE)
  if (rewardPool.lt(MINIMUM_REWARD_POOL)) {
    rewardPool = MINIMUM_REWARD_POOL
  }

  lp.reward = lp.crops.div(staking.totalCrops).times(rewardPool)
  lp.save()
}

export function updateRewardForAll(event: ethereum.Event): void {
  let staking = Staking.load(STAKING_ID)
  if (staking == null) {
    return
  }

  let lps1 = staking.liquidityProviders
  for (let i = 0; i < lps1.length; i++) {
    let lpid = lps1.shift()
    let provider = LiquidityProvider.load(lpid)
    updateLPCrops(provider as LiquidityProvider, staking as Staking)
  }

  let lps2 = staking.liquidityProviders
  for (let i = 0; i < lps2.length; i++) {
    let lpid = lps2.shift()
    let provider = LiquidityProvider.load(lpid)
    updateReward(provider as LiquidityProvider, staking as Staking)
    createRewardPositionSnapshot(provider as LiquidityProvider, event)
  }

  staking.save()
  createStakingSnapshot(staking as Staking, event)
}

export function createRewardPositionSnapshot(lp: LiquidityProvider, event: ethereum.Event): void {
  let timestamp = event.block.timestamp
  let hourStartUnix = convertTimestampToNextHourStartUnix(timestamp)

  // create new snapshot
  let snapshot = new RewardPositionSnapshot(lp.id.concat('-').concat(hourStartUnix.toString()))
  snapshot.timestamp = hourStartUnix
  snapshot.address = lp.address
  snapshot.liquidityProvider = lp.id
  snapshot.totalLiquidityProvidedETH = lp.totalLiquidityProvidedETH
  snapshot.totalLiquidityProvidedUSD = lp.totalLiquidityProvidedUSD
  snapshot.totalTokenStaked = lp.totalTokenStaked
  snapshot.totalTokenStakedUSD = lp.totalTokenStakedUSD
  snapshot.share = lp.share
  snapshot.factorA = lp.factorA
  snapshot.factorB = lp.factorB
  snapshot.crops = lp.crops
  snapshot.reward = lp.reward
  snapshot.save()
}

export function createStakingSnapshot(staking: Staking, event: ethereum.Event): void {
  let timestamp = event.block.timestamp
  let hourStartUnix = convertTimestampToNextHourStartUnix(timestamp)

  let snapshot = new StakingSnapshot(STAKING_ID.concat('-').concat(hourStartUnix.toString()))
  snapshot.timestamp = hourStartUnix
  snapshot.stakeCount = staking.stakeCount
  snapshot.stakerCount = staking.stakerCount
  snapshot.totalTokenStaked = staking.totalTokenStaked
  snapshot.totalTokenStakedUSD = staking.totalTokenStakedUSD
  snapshot.totalCrops = staking.totalCrops
  snapshot.save()
}
