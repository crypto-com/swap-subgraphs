import { BigInt, BigDecimal } from "@graphprotocol/graph-ts"
import { Pair as PairContract, Mint, Burn, Swap, Transfer, Sync } from '../types/templates/Pair/Pair'
import { Pair, Token, Factory, LiquidityProvider, LiquidityPosition, Staking } from '../types/schema'

import {
  FACTORY_ADDRESS,
  ADDRESS_ZERO,
  ZERO_BD,
  BI_18,
  STAKING_ID,
  convertTokenToDecimal
} from './helpers'
import {
  findEthPerToken,
  getETHPriceInUSD,
  getTrackedLiquidityUSD
} from './pricing'
import {
  createLiquidityProvider,
  createLiquidityPosition,
  updateRewardForAll
} from './liquidity'

export function handleTransfer(event: Transfer): void {
  if (event.params.to.toHexString() == ADDRESS_ZERO && event.params.value.equals(BigInt.fromI32(1000))) {
    return
  }

  let factory = Factory.load(FACTORY_ADDRESS)

  let from = event.params.from
  let to = event.params.to

  let pair = Pair.load(event.address.toHexString())
  let pairContract = PairContract.bind(event.address)

  let value = convertTokenToDecimal(event.params.value, BI_18)

  // mint
  if (from.toHexString() == ADDRESS_ZERO) {
    // update total supply
    pair.totalSupply = pair.totalSupply.plus(value)
    pair.save()
  }

  // burn
  if (event.params.to.toHexString() == ADDRESS_ZERO && event.params.from.toHexString() == pair.id) {
    pair.totalSupply = pair.totalSupply.minus(value)
    pair.save()
  }

  if (from.toHexString() != ADDRESS_ZERO && from.toHexString() != pair.id) {
    let provider = createLiquidityProvider(from)
    let position = createLiquidityPosition(event.address, from)

    if (pair.totalSupply.gt(ZERO_BD)) {
      // position.reserveETH = pair.reserveETH
      // position.reserveUSD = pair.reserveUSD
      position.liquidityTokenBalance = convertTokenToDecimal(pairContract.balanceOf(from), BI_18)
      position.totalSupply = pair.totalSupply
      // position.liquidityProvidedETH = position.reserveETH.times(position.liquidityTokenBalance.div(position.totalSupply))
      // position.liquidityProvidedUSD = position.reserveUSD.times(position.liquidityTokenBalance.div(position.totalSupply))
    } else {
      // position.reserveETH = ZERO_BD
      // position.reserveUSD = ZERO_BD
      position.liquidityTokenBalance = ZERO_BD
      position.totalSupply = ZERO_BD
      // position.liquidityProvidedETH = ZERO_BD
      // position.liquidityProvidedUSD = ZERO_BD
    }

    position.save()
  }

  if (event.params.to.toHexString() != ADDRESS_ZERO && to.toHexString() != pair.id) {
    let provider = createLiquidityProvider(to)
    let position = createLiquidityPosition(event.address, to)

    if (pair.totalSupply.gt(ZERO_BD)) {
      // position.reserveETH = pair.reserveETH
      // position.reserveUSD = pair.reserveUSD
      position.liquidityTokenBalance = convertTokenToDecimal(pairContract.balanceOf(to), BI_18)
      position.totalSupply = pair.totalSupply
      // position.liquidityProvidedETH = position.reserveETH.times(position.liquidityTokenBalance.div(position.totalSupply))
      // position.liquidityProvidedUSD = position.reserveUSD.times(position.liquidityTokenBalance.div(position.totalSupply))
    } else {
      // position.reserveETH = ZERO_BD
      // position.reserveUSD = ZERO_BD
      position.liquidityTokenBalance = ZERO_BD
      position.totalSupply = ZERO_BD
      // position.liquidityProvidedETH = ZERO_BD
      // position.liquidityProvidedUSD = ZERO_BD
    }

    position.save()
  }

  // update the totalSupply of all liquidityProviders
  let positions = pair.liquidityPositions
  for (let i = 0; i < positions.length; ++i) {
    let positionID = positions.shift()
    let position = LiquidityPosition.load(positionID)
    position.totalSupply = pair.totalSupply
    position.save()
  }

  // liquidityProvided will be updated in handleSync when we know the new reserve size
}

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHex())
  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)
  let factory = Factory.load(FACTORY_ADDRESS)

  // reset factory liquidity by subtracting only tracked liquidity
  factory.totalLiquidityETH = factory.totalLiquidityETH.minus(pair.trackedReserveETH as BigDecimal)

  // reset token total liquidity amounts
  token0.totalLiquidity = token0.totalLiquidity.minus(pair.reserve0)
  token1.totalLiquidity = token1.totalLiquidity.minus(pair.reserve1)

  pair.reserve0 = convertTokenToDecimal(event.params.reserve0, token0.decimals)
  pair.reserve1 = convertTokenToDecimal(event.params.reserve1, token1.decimals)

  if (pair.reserve1.notEqual(ZERO_BD))
    pair.token0Price = pair.reserve0.div(pair.reserve1)
  else
    pair.token0Price = ZERO_BD
  if (pair.reserve0.notEqual(ZERO_BD))
    pair.token1Price = pair.reserve1.div(pair.reserve0)
  else
    pair.token1Price = ZERO_BD

  pair.save()

  token0.derivedETH = findEthPerToken(token0 as Token)
  token1.derivedETH = findEthPerToken(token1 as Token)
  token0.save()
  token1.save()

  // get tracked liquidity - will be 0 if neither is in whitelist
  let trackedLiquidityETH: BigDecimal
  let ethPrice = getETHPriceInUSD()
  if (ethPrice.notEqual(ZERO_BD)) {
    trackedLiquidityETH = getTrackedLiquidityUSD(pair.reserve0, token0 as Token, pair.reserve1, token1 as Token).div(ethPrice)
  } else {
    trackedLiquidityETH = ZERO_BD
  }

  // use derived amounts within pair
  pair.trackedReserveETH = trackedLiquidityETH
  pair.reserveETH = pair.reserve0
    .times(token0.derivedETH as BigDecimal)
    .plus(pair.reserve1.times(token1.derivedETH as BigDecimal))
  pair.reserveUSD = pair.reserveETH.times(ethPrice)

  // use tracked amounts globally
  factory.totalLiquidityETH = factory.totalLiquidityETH.plus(trackedLiquidityETH)
  factory.totalLiquidityUSD = factory.totalLiquidityETH.times(ethPrice)

  // now correctly set liquidity amounts for each token
  token0.totalLiquidity = token0.totalLiquidity.plus(pair.reserve0)
  token1.totalLiquidity = token1.totalLiquidity.plus(pair.reserve1)

  // save entities
  pair.save()
  factory.save()
  token0.save()
  token1.save()

  // update liquidityProvided of all liquidityPositions
  let staking = Staking.load(STAKING_ID)
  let positions = pair.liquidityPositions
  for (let i = 0; i < positions.length; ++i) {
    let positionID = positions.shift()
    let position = LiquidityPosition.load(positionID)
    let provider = LiquidityProvider.load(position.provider)

    // minus old liquidityProvided
    provider.totalLiquidityProvidedETH = provider.totalLiquidityProvidedETH.minus(position.liquidityProvidedETH)
    provider.totalLiquidityProvidedUSD = provider.totalLiquidityProvidedUSD.minus(position.liquidityProvidedUSD)

    if (position.totalSupply.gt(ZERO_BD)) {
      position.reserveETH = pair.reserveETH
      position.reserveUSD = pair.reserveUSD
      position.liquidityProvidedETH = position.reserveETH.times(position.liquidityTokenBalance.div(position.totalSupply))
      position.liquidityProvidedUSD = position.reserveUSD.times(position.liquidityTokenBalance.div(position.totalSupply))
    } else {
      position.reserveETH = ZERO_BD
      position.reserveUSD = ZERO_BD
      position.liquidityProvidedETH = ZERO_BD
      position.liquidityProvidedUSD = ZERO_BD
    }

    // add new liquidityProvided
    provider.totalLiquidityProvidedETH = provider.totalLiquidityProvidedETH.plus(position.liquidityProvidedETH)
    provider.totalLiquidityProvidedUSD = provider.totalLiquidityProvidedUSD.plus(position.liquidityProvidedUSD)

    provider.save()
    position.save()
  }

  updateRewardForAll(event)
}

export function handleMint(event: Mint): void {
}

export function handleBurn(event: Burn): void {
}

export function handleSwap(event: Swap): void {
}
