import { Sync } from "../types/ETHUSDC/Pair"
import { Price, HourlyPriceHistory } from "../types/schema"
import {
  ZERO_BD,
  USDC_DECIMALS,
  ETH_DECIMALS,
  PRICE_ID,
  convertTokenToDecimal,
  takePriceHourlySnapshot
} from "./helpers"

export function handleSync(event: Sync): void {
  let usdcReserve = convertTokenToDecimal(event.params.reserve0, USDC_DECIMALS)
  let ethReserve = convertTokenToDecimal(event.params.reserve1, ETH_DECIMALS)

  let price = Price.load(PRICE_ID)
  if (price == null) {
    price = new Price(PRICE_ID)
    price.eth = ZERO_BD
    price.cro = ZERO_BD
  }

  if (usdcReserve.notEqual(ZERO_BD)) {
    price.eth = usdcReserve.div(ethReserve)
  }

  price.save()

  takePriceHourlySnapshot(event.block.timestamp, price!)
}
