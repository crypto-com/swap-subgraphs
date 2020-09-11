import { BigInt, BigDecimal, Address } from "@graphprotocol/graph-ts"
import {
  Price,
  HourlyPriceHistory,
  Staking,
  Token
} from "../types/schema"
import { Factory as FactoryContract } from '../types/templates/Pair/Factory'

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)

export let ETH_DECIMALS = BigInt.fromI32(18)
export let CRO_DECIMALS = BigInt.fromI32(8)
export let USDC_DECIMALS = BigInt.fromI32(6)

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export const FACTORY_ADDRESS = '0x9DEB29c9a4c7A88a3C0257393b7f3335338D9A9D'
export const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

export const STAKING_ONE_YEAR_ADDRESS = '0x6aba3e56aeb3b95ad64161103d793fac5f6ce4f7'
export const STAKING_TWO_YEAR_ADDRESS = '0x26388d599a677c6a8bcc4c113f0a34e6ced9493d'
export const STAKING_THREE_YEAR_ADDRESS = '0x0a3c6eec8408bded9000da65afdb8a8fda99e253'
export const STAKING_FOUR_YEAR_ADDRESS = '0x4f2bc163c8758d7f88771496f7b0afde767045f3'

export let PRICE_ID = '1'
export let STAKING_ID = '1'

export let factoryContract = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS))

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export function convertTokenToDecimal(tokenAmount: BigInt, exchangeDecimals: BigInt): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

export function convertTimestampToHourStartUnix(timestamp: BigInt): BigInt {
  let hourIndex = timestamp.toI32() / 3600 // get unique hour within unix history
  let hourStartUnix = hourIndex * 3600 // want the rounded effect

  return BigInt.fromI32(hourStartUnix)
}

export function convertTimestampToNextHourStartUnix(timestamp: BigInt): BigInt {
  let hourIndex = timestamp.toI32() / 3600 // get unique hour within unix history
  let hourStartUnix = (hourIndex + 1) * 3600 // want the rounding up effect

  return BigInt.fromI32(hourStartUnix)
}

export function convertContractAddressToTerm(address: string): string {
  if (address == STAKING_ONE_YEAR_ADDRESS) {
    return '1'
  } else if (address == STAKING_TWO_YEAR_ADDRESS) {
    return '2'
  } else if (address == STAKING_THREE_YEAR_ADDRESS) {
    return '3'
  } else if (address == STAKING_FOUR_YEAR_ADDRESS) {
    return '4'
  } else {
    return 'Unknown'
  }
}

export function initStaking(): Staking {
  let staking = Staking.load(STAKING_ID)
  if (staking == null) {
    staking = new Staking(STAKING_ID)
    staking.stakeCount = 0
    staking.stakerCount = 0
    staking.totalTokenStaked = ZERO_BD
    staking.totalTokenStakedUSD = ZERO_BD
    staking.stakes = []
    staking.liquidityProviders = []
    staking.totalCrops = ZERO_BD
    staking.save()
  }

  return staking as Staking
}

export function takePriceHourlySnapshot(timestamp: BigInt, price: Price): void {
  let hourStartUnix = convertTimestampToNextHourStartUnix(timestamp)
  let hourID = hourStartUnix.toString()

  // Snapshot
  let history = new HourlyPriceHistory(hourID)
  history.timestamp = hourStartUnix
  history.eth = price.eth
  history.cro = price.cro
  history.save()
}
