import { Option, pipe } from 'effect'
import { Platform } from 'react-native'
import Purchases, {
  type CustomerInfo,
  LOG_LEVEL,
  type PurchasesOffering,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases'

const getApiKey = (): string =>
  pipe(
    Option.fromNullable(
      Platform.OS === 'ios'
        ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
    ),
    Option.getOrElse(() => '')
  )

let isConfigured = false
let isDevMode = false

/**
 * Check if RevenueCat is configured with API keys.
 */
export const isEnabled = (): boolean => isConfigured || isDevMode

/**
 * Check if running in dev/mock mode.
 */
export const isDevModeEnabled = (): boolean => isDevMode

/**
 * Initialize RevenueCat SDK.
 * Call once on app start. Falls back to dev mode if no API key is configured.
 */
export const initialize = (): void => {
  const apiKey = getApiKey()
  if (apiKey) {
    // Enable verbose logging for debugging
    Purchases.setLogLevel(LOG_LEVEL.VERBOSE)
    Purchases.configure({ apiKey })
    isConfigured = true
    console.log(`[RevenueCat] Initialized with API key ${apiKey}`)
    // Log the App User ID for dashboard lookup
    Purchases.getAppUserID().then((userId) => {
      console.log(`[RevenueCat] App User ID: ${userId}`)
      console.log(
        '[RevenueCat] Use this ID to find the customer in RevenueCat dashboard'
      )
    })
  } else {
    isDevMode = true
    console.log(
      '[RevenueCat] No API key - running in DEV MODE (mock purchases)'
    )
  }
}

// Mock offerings for dev mode
const createMockOfferings = (): PurchasesOfferings => {
  const defaultOffering: PurchasesOffering = {
    identifier: 'default',
    serverDescription: 'Default Offering',
    metadata: {},
    availablePackages: [],
    lifetime: null,
    annual: {
      identifier: '$rc_annual',
      packageType: 'ANNUAL',
      product: {
        identifier: 'lily_annual',
        description: 'Annual subscription',
        title: 'Lily Pro Annual',
        price: 29.99,
        priceString: '€29.99',
        pricePerMonth: 2.5,
        pricePerMonthString: '€2.50',
        pricePerWeek: 0.58,
        pricePerWeekString: '€0.58',
        pricePerYear: 29.99,
        pricePerYearString: '€29.99',
        currencyCode: 'EUR',
        introPrice: null,
        discounts: [],
        productCategory: 'SUBSCRIPTION',
        productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
        subscriptionPeriod: 'P1Y',
        defaultOption: null,
        subscriptionOptions: null,
        presentedOfferingIdentifier: 'default',
        presentedOfferingContext: null,
      },
      offeringIdentifier: 'default',
      presentedOfferingContext: {
        offeringIdentifier: 'default',
        placementIdentifier: null,
        targetingContext: null,
      },
    } as PurchasesPackage,
    monthly: {
      identifier: '$rc_monthly',
      packageType: 'MONTHLY',
      product: {
        identifier: 'lily_monthly',
        description: 'Monthly subscription',
        title: 'Lily Pro Monthly',
        price: 4.99,
        priceString: '€4.99',
        pricePerMonth: 4.99,
        pricePerMonthString: '€4.99',
        pricePerWeek: 1.25,
        pricePerWeekString: '€1.25',
        pricePerYear: 59.88,
        pricePerYearString: '€59.88',
        currencyCode: 'EUR',
        introPrice: null,
        discounts: [],
        productCategory: 'SUBSCRIPTION',
        productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
        subscriptionPeriod: 'P1M',
        defaultOption: null,
        subscriptionOptions: null,
        presentedOfferingIdentifier: 'default',
        presentedOfferingContext: null,
      },
      offeringIdentifier: 'default',
      presentedOfferingContext: {
        offeringIdentifier: 'default',
        placementIdentifier: null,
        targetingContext: null,
      },
    } as PurchasesPackage,
    weekly: null,
    twoMonth: null,
    threeMonth: null,
    sixMonth: null,
  }

  return {
    all: { default: defaultOffering },
    current: defaultOffering,
  }
}

const mockOfferings = createMockOfferings()

/**
 * Link RevenueCat to the authenticated Lily user ID.
 * Call after user logs in.
 */
export const identify = async (userId: string): Promise<void> => {
  if (isDevMode) {
    console.log(`[RevenueCat DEV] identify(${userId})`)
    return
  }
  if (!isConfigured) return
  await Purchases.logIn(userId)
}

/**
 * Clear RevenueCat user identity.
 * Call on logout.
 */
export const logout = async (): Promise<void> => {
  if (isDevMode) {
    console.log('[RevenueCat DEV] logout()')
    return
  }
  if (!isConfigured) return
  await Purchases.logOut()
}

/**
 * Fetch available offerings for display.
 * Returns packages with localized prices.
 * Returns mock offerings in dev mode.
 */
export const getOfferings = async (): Promise<PurchasesOfferings | null> => {
  if (isDevMode) {
    console.log('[RevenueCat DEV] getOfferings() - returning mock data')
    return mockOfferings
  }
  if (!isConfigured) {
    console.log('[RevenueCat] getOfferings() - not configured, returning null')
    return null
  }
  try {
    console.log('[RevenueCat] Fetching offerings from RevenueCat...')
    const offerings = await Purchases.getOfferings()
    console.log('[RevenueCat] Offerings received:', {
      current: offerings.current?.identifier ?? null,
      allKeys: Object.keys(offerings.all),
    })
    return offerings
  } catch (error) {
    console.error('[RevenueCat] Failed to fetch offerings:', error)
    return null
  }
}

/**
 * Execute a purchase via RevenueCat SDK.
 * In dev mode, simulates a successful purchase.
 */
export const purchase = async (
  pkg: PurchasesPackage
): Promise<CustomerInfo> => {
  if (isDevMode) {
    console.log(`[RevenueCat DEV] purchase(${pkg.identifier}) - simulating...`)
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500))
    console.log('[RevenueCat DEV] Purchase simulated successfully')
    // Return mock customer info
    return {} as CustomerInfo
  }
  if (!isConfigured) {
    throw new Error('RevenueCat is not configured. Please set up API keys.')
  }
  const { customerInfo } = await Purchases.purchasePackage(pkg)
  return customerInfo
}

/**
 * Restore previous purchases.
 * In dev mode, simulates a restore.
 */
export const restorePurchases = async (): Promise<CustomerInfo> => {
  if (isDevMode) {
    console.log('[RevenueCat DEV] restorePurchases() - simulating...')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.log('[RevenueCat DEV] Restore simulated')
    return {} as CustomerInfo
  }
  if (!isConfigured) {
    throw new Error('RevenueCat is not configured. Please set up API keys.')
  }
  const customerInfo = await Purchases.restorePurchases()
  return customerInfo
}

/**
 * Get current customer info with debug logging.
 * Useful for debugging subscription status.
 */
export const getCustomerInfo = async (): Promise<CustomerInfo | null> => {
  if (isDevMode) {
    console.log('[RevenueCat DEV] getCustomerInfo() - returning mock')
    return {} as CustomerInfo
  }
  if (!isConfigured) {
    console.log('[RevenueCat] getCustomerInfo() - not configured')
    return null
  }
  try {
    const customerInfo = await Purchases.getCustomerInfo()
    console.log('[RevenueCat] Customer Info:', {
      appUserId: await Purchases.getAppUserID(),
      activeEntitlements: Object.keys(customerInfo.entitlements.active),
      allEntitlements: Object.keys(customerInfo.entitlements.all),
      activeSubscriptions: customerInfo.activeSubscriptions,
      managementURL: customerInfo.managementURL,
    })
    return customerInfo
  } catch (error) {
    console.error('[RevenueCat] Failed to get customer info:', error)
    return null
  }
}

/**
 * Debug helper: Log full RevenueCat state.
 * Call this to troubleshoot issues.
 */
export const debugState = async (): Promise<void> => {
  console.log('=== RevenueCat Debug State ===')
  console.log('Configured:', isConfigured)
  console.log('Dev Mode:', isDevMode)

  if (isDevMode) {
    console.log('Running in DEV MODE - no real RevenueCat calls')
    return
  }

  if (!isConfigured) {
    console.log('Not configured - check API key in env')
    return
  }

  try {
    const appUserId = await Purchases.getAppUserID()
    console.log('App User ID:', appUserId)
    console.log('→ Search this in RevenueCat dashboard: Customers tab')

    const offerings = await Purchases.getOfferings()
    console.log('Offerings:', {
      hasCurrent: !!offerings.current,
      currentId: offerings.current?.identifier ?? 'none',
      allOfferingIds: Object.keys(offerings.all),
      packages: offerings.current?.availablePackages.length ?? 0,
    })

    const customerInfo = await Purchases.getCustomerInfo()
    console.log('Entitlements:', {
      active: Object.keys(customerInfo.entitlements.active),
      all: Object.keys(customerInfo.entitlements.all),
    })
    console.log('Active Subscriptions:', customerInfo.activeSubscriptions)
    console.log('==============================')
  } catch (error) {
    console.error('Debug state error:', error)
  }
}
