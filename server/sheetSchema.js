export const HH_SCHEMA = {
  products_HH: ["sku", "name", "category", "brand", "price", "stock", "active", "image"],
  LiquidPrices_HH: ["city", "qty_from", "qty_to", "price"],
  couriers_HH: ["courier_id", "name", "tg_id", "active", "time_from", "time_to", "treffpunkt"],
  orders_HH: ["order_id", "user_id", "status", "total_amount", "courier_id", "delivery_date", "delivery_time", "payment_method", "created_at", "delivered_at", "items (JSON)", "city"],
  metrics_HH: ["date", "orders", "revenue", "avg_check", "upsell_clicks", "upsell_accepts", "repeat_purchases", "liquids_sales", "electronics_sales", "growth_percent", "platform_commission", "courier_commission"],
};

export const TEST_ROWS = {
  products_HH: ["TEST-HH-001", "Тест", "liquids", "ELFIN", "1", "2", "TRUE", ""],
  LiquidPrices_HH: ["HH", "1", "5", "1"],
  couriers_HH: ["test-courier", "Тест", "900000001", "TRUE", "12:00", "18:00", "Тест"],
  orders_HH: [],
  metrics_HH: [],
};
