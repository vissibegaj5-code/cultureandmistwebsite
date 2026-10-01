import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const listings = sqliteTable('listings', {
  id: text('id').primaryKey(),
  sellerId: text('seller_id').notNull(),
  sellerName: text('seller_name').notNull(),
  sellerEmail: text('seller_email').notNull(),
  title: text('title').notNull(),
  brand: text('brand').notNull(),
  category: text('category').notNull(),
  condition: text('condition').notNull(),
  description: text('description').notNull(),
  priceCents: integer('price_cents').notNull(),
  imageKey: text('image_key').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_listings_status_created').on(table.status, table.createdAt), index('idx_listings_seller_created').on(table.sellerId, table.createdAt)]);

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  listingId: text('listing_id').notNull(),
  buyerId: text('buyer_id').notNull(),
  sellerId: text('seller_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status').notNull(),
  paymentReference: text('payment_reference'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_orders_seller_created').on(table.sellerId, table.createdAt)]);

export const stripeAccounts = sqliteTable('stripe_accounts', {
  sellerId: text('seller_id').primaryKey(),
  stripeAccountId: text('stripe_account_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
});
