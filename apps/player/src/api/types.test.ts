import { describe, expect, it } from 'vitest'
import openapi from '../../../api/openapi.json'
import type * as T from './types'

/**
 * Every hand-written type in types.ts against its schema in apps/api/openapi.json.
 * `allKeys` fails to compile if a list misses a field of the type, so the lists
 * can't silently fall behind types.ts either.
 */
const allKeys =
  <Type>() =>
  <const Keys extends readonly (keyof Type)[]>(keys: Keys & ([keyof Type] extends [Keys[number]] ? unknown : never)) =>
    keys as readonly string[]

const TYPES: Record<string, readonly string[]> = {
  RangeSummary: allKeys<T.RangeSummary>()(['id', 'slug', 'name', 'timeZone', 'currency']),
  Range: allKeys<T.Range>()(['id', 'slug', 'name', 'timeZone', 'currency', 'prices', 'openingHours', 'peakWindows', 'bays', 'addOns', 'bucketProducts', 'passProducts']),
  OpeningHours: allKeys<T.OpeningHours>()(['weekday', 'opens', 'closes']),
  PeakWindow: allKeys<T.PeakWindow>()(['weekday', 'from', 'to']),
  Bay: allKeys<T.Bay>()(['id', 'rangeId', 'number', 'name', 'active', 'offPeakCentsPerHour', 'peakCentsPerHour']),
  AddOnPrice: allKeys<T.AddOnPrice>()(['kind', 'priceCents', 'unit']),
  BucketProduct: allKeys<T.BucketProduct>()(['id', 'name', 'balls', 'priceCents', 'active']),
  PassProduct: allKeys<T.PassProduct>()(['id', 'kind', 'name', 'priceCents', 'days', 'discountPercent', 'balls', 'active']),
  Slot: allKeys<T.Slot>()(['startsAt', 'endsAt', 'localTime', 'peak', 'priceCents', 'free']),
  Availability: allKeys<T.Availability>()(['rangeId', 'date', 'timeZone', 'hours', 'bays']),
  Account: allKeys<T.Account>()(['id', 'email', 'name', 'createdAt']),
  Session: allKeys<T.Session>()(['sessionToken', 'expiresAt', 'account']),
  Me: allKeys<T.Me>()(['account', 'staffAt']),
  Order: allKeys<T.Order>()(['id', 'accountId', 'rangeId', 'kind', 'status', 'totalCents', 'currency', 'lines', 'paymentProvider', 'failureReason', 'createdAt', 'paidAt', 'refundedAt']),
  Hire: allKeys<T.Hire>()(['id', 'status', 'robot', 'bayNumber', 'startsAt', 'endsAt', 'key', 'link']),
  Booking: allKeys<T.Booking>()(['id', 'range', 'bay', 'accountId', 'source', 'externalRef', 'customerName', 'startsAt', 'endsAt', 'hours', 'status', 'checkedInAt', 'addOns', 'totalCents', 'currency', 'order', 'hire', 'createdAt', 'cancelledAt']),
  BookingRequest: allKeys<T.BookingRequest>()(['bayId', 'startsAt', 'hours', 'addOns', 'paymentMethod']),
  AddOnRequest: allKeys<T.AddOnRequest>()(['kind', 'quantity']),
  Pass: allKeys<T.Pass>()(['id', 'range', 'name', 'discountPercent', 'validFrom', 'validTo', 'orderId']),
  PassPurchase: allKeys<T.PassPurchase>()(['order', 'pass', 'ballCredit']),
  PassOrderRequest: allKeys<T.PassOrderRequest>()(['rangeId', 'passProductId', 'paymentMethod']),
  BucketCode: allKeys<T.BucketCode>()(['id', 'code', 'rangeId', 'bucket', 'orderId', 'accountId', 'createdAt', 'redeemedAt', 'redeemedBy']),
  BucketPurchase: allKeys<T.BucketPurchase>()(['order', 'bucketCode']),
  BucketOrderRequest: allKeys<T.BucketOrderRequest>()(['rangeId', 'bucketProductId', 'payWith']),
  Wallet: allKeys<T.Wallet>()(['passes', 'ballCredit', 'bucketCodes']),
  CheckIn: allKeys<T.CheckIn>()(['checkedInAt', 'bay', 'booking', 'hireLink']),
  HireKeyPublicKey: allKeys<T.HireKeyPublicKey>()(['algorithm', 'hex', 'base64', 'keyVersion']),
}

type Schema = { properties?: Record<string, unknown>; allOf?: Schema[]; $ref?: string }
const schemas = (openapi as unknown as { components: { schemas: Record<string, Schema> } }).components.schemas

function propertiesOf(schema: Schema): string[] {
  if (schema.$ref) return propertiesOf(schemas[schema.$ref.split('/').pop()!])
  if (schema.allOf) return schema.allOf.flatMap(propertiesOf)
  return Object.keys(schema.properties ?? {})
}

describe('api/types.ts matches apps/api/openapi.json', () => {
  for (const [name, keys] of Object.entries(TYPES)) {
    it(name, () => {
      expect(schemas[name], `${name} is in openapi.json`).toBeDefined()
      expect([...keys].sort()).toEqual(propertiesOf(schemas[name]).sort())
    })
  }

  it('has the add-on kinds the API has', () => {
    expect((schemas.AddOnKind as { enum: string[] }).enum.sort()).toEqual(['club_hire', 'lesson', 'robot'] satisfies T.AddOnKind[])
  })
})
