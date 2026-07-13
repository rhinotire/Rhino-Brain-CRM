// @rhino/services — authorization + business rules shared by all apps.
// Trust tiers (docs/architecture.md): the public website may ONLY call
// PublicCatalogService (and, later, lead/quote-request writes). Internal
// services assume the caller has already authenticated a CRM session.
export { ProductService, type ProductSearchParams } from "./product-service";
export { InventoryService, type SnapshotRow, type SnapshotResult } from "./inventory-service";
export { PublicCatalogService } from "./public-catalog-service";
export { PublicLeadService, rateLimited, type QuoteRequestInput, type DealerApplicationInput, type PublicLeadResult } from "./public-lead-service";
export { PublicInstallerService, type PublicInstallerDTO, type InstallationOptions } from "./public-installer-service";
export { PublicConsumerLeadService, type ConsumerLeadResult } from "./public-consumer-lead-service";
export { PublicBrandService, type PublicBrandDTO } from "./public-brand-service";
export { PublicArticleService, type PublicArticleDTO } from "./public-article-service";
export { PublicReferralService, type SendToInstallerResult } from "./public-referral-service";
export { matchInstallerReferral, phoneKey, domainKey, nameKey, type MatchResult } from "./referral-matching";
export { runReferralMaintenance } from "./referral-maintenance";
export { normalizeSizeInput, sizeNeedles, sizeSuggestion, type NormalizedSize } from "./size-normalize";
export { uploadDealerDoc, signDealerDocUrl, isDealerStorageConfigured } from "./storage";
export { recordEvent } from "./analytics";
export { isValidUsZip, zipDistanceMiles, zipCityState } from "./geo";
export { sendEmail, isEmailConfigured } from "./email";
export type {
  StockStatus,
  PublicProductDTO,
  PublicProductImageDTO,
  PublicTireSpecDTO,
  PublicWheelSpecDTO,
  PublicPartSpecDTO,
  InternalProductHit,
} from "./types";
