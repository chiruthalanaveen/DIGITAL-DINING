export const BUSINESS_TYPES = [
  ['general', 'General retail'], ['sarees', 'Sarees & ethnic wear'],
  ['fashion', 'Fashion'], ['grocery', 'Groceries'], ['food', 'Food ordering'],
  ['toys', 'Toys'], ['electronics', 'Electronics'], ['beauty', 'Beauty & cosmetics'],
  ['footwear', 'Footwear & accessories'], ['pharmacy', 'Pharmacy (activation restricted)'],
]

export const DEFAULT_BRANDING = {
  primary_color: '#155e46', background_color: '#f8faf8', text_color: '#17231e',
  logo_url: '', banner_url: '', headline: '', description: '',
  contact_email: '', contact_phone: '',
}

export const DEFAULT_FEATURES = { catalog: true, inventory: true, cod: true }
export const DEFAULT_FULFILLMENT = {
  pickup: true, delivery: false, delivery_fee_paise: 0, minimum_order_paise: 0,
  pickup_address: '',
}
export const DEFAULT_OWNER_PERMISSIONS = {
  products: true, categories: true, inventory: true, orders: true,
  branding: false, customers: false,
}

export function formatCommerceMoney(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100)
}
