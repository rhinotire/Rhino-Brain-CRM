// @rhino/services — authorization + business rules shared by all apps.
// Trust tiers (docs/architecture.md): the public website may ONLY call
// PublicCatalogService (and, later, lead/quote-request writes). Internal
// services assume the caller has already authenticated a CRM session.
export { ProductService, type ProductSearchParams } from "./product-service";
export { InventoryService, type SnapshotRow, type SnapshotResult } from "./inventory-service";
export { PublicCatalogService } from "./public-catalog-service";
export type {
  StockStatus,
  PublicProductDTO,
  PublicProductImageDTO,
  PublicTireSpecDTO,
  PublicWheelSpecDTO,
  PublicPartSpecDTO,
  InternalProductHit,
} from "./types";
