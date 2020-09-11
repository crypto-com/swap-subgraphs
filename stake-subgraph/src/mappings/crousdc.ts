import { Sync } from "../types/CROUSDC/Pair"
import { Price, HourlyPriceHistory } from "../types/schema"
import {
  ZERO_BD,
  CRO_DECIMALS,
  USDC_DECIMALS,
  PRICE_ID,
  convertTokenToDecimal,
  takePriceHourlySnapshot
} from "./helpers"

export function handleSync(event: Sync): void {
  let croReserve = convertTokenToDecimal(event.params.reserve0, CRO_DECIMALS)
  let usdcReserve = convertTokenToDecimal(event.params.reserve1, USDC_DECIMALS)

  let price = Price.load(PRICE_ID)
  if (price == null) {
    price = new Price(PRICE_ID)
    price.eth = ZERO_BD
    price.cro = ZERO_BD
  }

  if (croReserve.notEqual(ZERO_BD)) {
    price.cro = usdcReserve.div(croReserve)
  }

  price.save()

  takePriceHourlySnapshot(event.block.timestamp, price!)
}
