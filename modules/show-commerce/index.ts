import { requireOptionalNativeModule } from 'expo';

export const REMOVE_PROMOTIONS_PRODUCT_ID = 'remove_promotions' as const;

export interface CommerceProduct {
  readonly productId: typeof REMOVE_PROMOTIONS_PRODUCT_ID;
  readonly title: string;
  readonly description: string;
  /** Localized storefront price. The app must never synthesize or hardcode a price. */
  readonly displayPrice: string;
  readonly currencyCode?: string;
  readonly source: 'app_store' | 'play_store';
}

export interface CommerceEntitlement {
  readonly productId: typeof REMOVE_PROMOTIONS_PRODUCT_ID;
  readonly owned: boolean;
  readonly status: 'owned' | 'not_owned' | 'pending' | 'unknown';
  readonly verification: 'storekit_verified' | 'play_store_reported' | 'not_applicable';
  readonly source: 'app_store' | 'play_store';
  readonly detail: string;
  /** Ephemeral native delivery handle. Never store a receipt or this handle in backups. */
  readonly deliveryId?: string;
}

export interface CommercePurchaseResult extends CommerceEntitlement {
  readonly outcome: 'purchased' | 'already_owned' | 'pending' | 'cancelled';
}

export interface NativeSubscription { remove(): void }

type RawModule = {
  product(): Promise<CommerceProduct>;
  currentEntitlement(): Promise<CommerceEntitlement>;
  purchase(): Promise<CommercePurchaseResult>;
  restore(): Promise<CommerceEntitlement>;
  completeDelivery?(deliveryId: string): Promise<void>;
  addListener(
    eventName: 'onEntitlementChanged',
    listener: (event: CommerceEntitlement) => void,
  ): NativeSubscription;
};

let raw: RawModule | null = null;
try { raw = requireOptionalNativeModule<RawModule>('ShowCommerce'); }
catch { /* Optional commerce loading cannot prevent local shows from opening. */ }

function required(): RawModule {
  if (!raw) {
    throw new Error(
      'ShowCommerce is unavailable. Build the native development client; Expo Go cannot access the stores.',
    );
  }
  return raw;
}

export default {
  product: () => required().product(),
  currentEntitlement: () => required().currentEntitlement(),
  purchase: () => required().purchase(),
  restore: () => required().restore(),
  completeDelivery: (deliveryId: string) => {
    const native = required();
    if (!native.completeDelivery) throw new Error('Store confirmation requires the updated native app.');
    return native.completeDelivery(deliveryId);
  },
  addEntitlementListener: (listener: (event: CommerceEntitlement) => void) =>
    required().addListener('onEntitlementChanged', listener),
};
