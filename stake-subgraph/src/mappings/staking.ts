import { log, BigDecimal, Address } from "@graphprotocol/graph-ts"
import { ERC900, Staked, Unstaked } from "../types/StakingOneYear/ERC900"
import { Stake, Staker, Staking, LiquidityProvider } from "../types/schema"
import {
  ZERO_BD,
  CRO_DECIMALS,
  STAKING_ID,
  convertTokenToDecimal,
  convertContractAddressToTerm,
  convertTimestampToNextHourStartUnix,
  initStaking
} from "./helpers"
import {
  createLiquidityProvider,
  updateRewardForAll,
} from './liquidity'
import { getCROPriceInUSD } from "./pricing"

export function handleStaked(event: Staked): void {
  let croPrice = getCROPriceInUSD()

  let stakeID = event.transaction.hash.toHexString()
  let stakedFor = event.params.user.toHexString()
  let stakedBy = event.transaction.from.toHexString()
  let tokenAmount = convertTokenToDecimal(event.params.amount, CRO_DECIMALS)
  let stakedAt = event.block.timestamp

  let contractAddress = event.address.toHexString()
  let term = convertContractAddressToTerm(contractAddress)
  let contract = ERC900.bind(event.address)
  let unlockAt = stakedAt + contract.defaultLockInDuration()

  let tokenAmountUSD = tokenAmount.times(croPrice)

  let stake = new Stake(stakeID)
  stake.stakedFor = stakedFor
  stake.stakedBy = stakedBy
  stake.tokenAmount = tokenAmount
  stake.tokenAmountUSD = tokenAmountUSD
  stake.stakedAt = stakedAt
  stake.contractAddress = contractAddress
  stake.term = term
  stake.unlockAt = unlockAt
  stake.save()

  let staking = initStaking()
  staking.stakeCount = staking.stakeCount + 1
  staking.totalTokenStaked = staking.totalTokenStaked + tokenAmount
  staking.totalTokenStakedUSD = staking.totalTokenStakedUSD + tokenAmountUSD

  let staker = Staker.load(stakedFor)
  if (staker == null) {
    staker = new Staker(stakedFor)
    staker.address = stakedFor
    staker.stakeCount = 0
    staker.totalTokenStaked = ZERO_BD
    staker.totalTokenStakedUSD = ZERO_BD
    staker.stakes = []

    staking.stakerCount = staking.stakerCount + 1
  }
  staker.stakeCount = staker.stakeCount + 1
  staker.totalTokenStaked = staker.totalTokenStaked + tokenAmount
  staker.totalTokenStakedUSD = staker.totalTokenStakedUSD + tokenAmountUSD

  let allStakes = staking.stakes
  allStakes.push(stake.id)
  staking.stakes = allStakes

  let stakerStakes = staker.stakes
  stakerStakes.push(stake.id)
  staker.stakes = stakerStakes

  staker.save()
  staking.save()

  let liquidityProvider = LiquidityProvider.load(stakedFor)
  if (liquidityProvider == null) {
    liquidityProvider = createLiquidityProvider(Address.fromString(stakedFor))
  }
  // update factorB base on the new stake
  let oldTokenStaked = liquidityProvider.totalTokenStaked
  let oldFactorB = liquidityProvider.factorB
  let factorB = oldTokenStaked.times(oldFactorB).plus(calMultiplier(stake).times(tokenAmount)).div(oldTokenStaked.plus(tokenAmount))

  liquidityProvider.totalTokenStaked = liquidityProvider.totalTokenStaked + tokenAmount
  liquidityProvider.totalTokenStakedUSD = liquidityProvider.totalTokenStakedUSD + tokenAmountUSD
  liquidityProvider.factorB = factorB
  liquidityProvider.save()

  updateRewardForAll(event)
}

export function handleUnstaked(event: Unstaked): void {}

export function calMultiplier(stake: Stake): BigDecimal {
  // Tier Table v1
  // 1,000       1.0   1.2   1.4   2.0
  // 5,000       1.3   1.4   1.8   2.5
  // 10,000      1.5   1.7   2.1   3.0
  // 50,000      2.0   2.3   2.9   4.0
  // 100,000     3.0   3.5   4.3   6.0
  // 500,000     4.0   4.6   5.7   8.0
  // 1,000,000   6.0   6.9   8.6   12.0
  // 5,000,000   8.0   9.2   11.4  16.0
  // 50,000,000  10.0  11.5  14.3  20.0
  if (stake.term == '1') {
    return calMultiplierForOneYearTerm(stake.tokenAmount)
  } else if (stake.term == '2') {
    return calMultiplierForTwoYearTerm(stake.tokenAmount)
  } else if (stake.term == '3') {
    return calMultiplierForThreeYearTerm(stake.tokenAmount)
  } else if (stake.term == '4') {
    return calMultiplierForFourYearTerm(stake.tokenAmount)
  } else {
    return ZERO_BD
  }
}

let BD_50M  = BigDecimal.fromString('50000000')
let BD_5M   = BigDecimal.fromString('5000000')
let BD_1M   = BigDecimal.fromString('1000000')
let BD_500K = BigDecimal.fromString('500000')
let BD_100K = BigDecimal.fromString('100000')
let BD_50K  = BigDecimal.fromString('50000')
let BD_10K  = BigDecimal.fromString('10000')
let BD_5K   = BigDecimal.fromString('5000')
let BD_1K   = BigDecimal.fromString('1000')

function calMultiplierForOneYearTerm(amount: BigDecimal): BigDecimal {
  let tier0 = BigDecimal.fromString('10.0')
  let tier1 = BigDecimal.fromString('8.0')
  let tier2 = BigDecimal.fromString('6.0')
  let tier3 = BigDecimal.fromString('4.0')
  let tier4 = BigDecimal.fromString('3.0')
  let tier5 = BigDecimal.fromString('2.0')
  let tier6 = BigDecimal.fromString('1.5')
  let tier7 = BigDecimal.fromString('1.3')
  let tier8 = BigDecimal.fromString('1.0')

  if (amount >= BD_50M) {
    return tier0
  } else if (amount >= BD_5M) {
    return tier1
  } else if (amount >= BD_1M) {
    return tier2
  } else if (amount >= BD_500K) {
    return tier3
  } else if (amount >= BD_100K) {
    return tier4
  } else if (amount >= BD_50K) {
    return tier5
  } else if (amount >= BD_10K) {
    return tier6
  } else if (amount >= BD_5K) {
    return tier7
  } else if (amount >= BD_1K) {
    return tier8
  } else {
    return ZERO_BD
  }
}

function calMultiplierForTwoYearTerm(amount: BigDecimal): BigDecimal {
  let tier0 = BigDecimal.fromString('11.5')
  let tier1 = BigDecimal.fromString('9.2')
  let tier2 = BigDecimal.fromString('6.9')
  let tier3 = BigDecimal.fromString('4.6')
  let tier4 = BigDecimal.fromString('3.5')
  let tier5 = BigDecimal.fromString('2.3')
  let tier6 = BigDecimal.fromString('1.7')
  let tier7 = BigDecimal.fromString('1.4')
  let tier8 = BigDecimal.fromString('1.2')

  if (amount >= BD_50M) {
    return tier0
  } else if (amount >= BD_5M) {
    return tier1
  } else if (amount >= BD_1M) {
    return tier2
  } else if (amount >= BD_500K) {
    return tier3
  } else if (amount >= BD_100K) {
    return tier4
  } else if (amount >= BD_50K) {
    return tier5
  } else if (amount >= BD_10K) {
    return tier6
  } else if (amount >= BD_5K) {
    return tier7
  } else if (amount >= BD_1K) {
    return tier8
  } else {
    return ZERO_BD
  }
}

function calMultiplierForThreeYearTerm(amount: BigDecimal): BigDecimal {
  let tier0 = BigDecimal.fromString('14.3')
  let tier1 = BigDecimal.fromString('11.4')
  let tier2 = BigDecimal.fromString('8.6')
  let tier3 = BigDecimal.fromString('5.7')
  let tier4 = BigDecimal.fromString('4.3')
  let tier5 = BigDecimal.fromString('2.9')
  let tier6 = BigDecimal.fromString('1.1')
  let tier7 = BigDecimal.fromString('1.8')
  let tier8 = BigDecimal.fromString('1.4')

  if (amount >= BD_50M) {
    return tier0
  } else if (amount >= BD_5M) {
    return tier1
  } else if (amount >= BD_1M) {
    return tier2
  } else if (amount >= BD_500K) {
    return tier3
  } else if (amount >= BD_100K) {
    return tier4
  } else if (amount >= BD_50K) {
    return tier5
  } else if (amount >= BD_10K) {
    return tier6
  } else if (amount >= BD_5K) {
    return tier7
  } else if (amount >= BD_1K) {
    return tier8
  } else {
    return ZERO_BD
  }
}

function calMultiplierForFourYearTerm(amount: BigDecimal): BigDecimal {
  let tier0 = BigDecimal.fromString('20.0')
  let tier1 = BigDecimal.fromString('16.0')
  let tier2 = BigDecimal.fromString('12.0')
  let tier3 = BigDecimal.fromString('8.0')
  let tier4 = BigDecimal.fromString('6.0')
  let tier5 = BigDecimal.fromString('4.0')
  let tier6 = BigDecimal.fromString('3.0')
  let tier7 = BigDecimal.fromString('2.5')
  let tier8 = BigDecimal.fromString('2.0')

  if (amount >= BD_50M) {
    return tier0
  } else if (amount >= BD_5M) {
    return tier1
  } else if (amount >= BD_1M) {
    return tier2
  } else if (amount >= BD_500K) {
    return tier3
  } else if (amount >= BD_100K) {
    return tier4
  } else if (amount >= BD_50K) {
    return tier5
  } else if (amount >= BD_10K) {
    return tier6
  } else if (amount >= BD_5K) {
    return tier7
  } else if (amount >= BD_1K) {
    return tier8
  } else {
    return ZERO_BD
  }
}
