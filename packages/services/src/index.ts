// @rhino/services — authorization + business rules shared by all apps.
// Trust tiers (docs/architecture.md): the public website may ONLY call
// PublicCatalogService (and, later, lead/quote-request writes). Internal
// services assume the caller has already authenticated a CRM session.
export { ProductService, type ProductSearchParams } from "./product-service";
export { InventoryService, type SnapshotRow, type SnapshotResult } from "./inventory-service";
export { PublicCatalogService } from "./public-catalog-service";
export { DealerAuthService, type DealerIdentity } from "./dealer-auth-service";
export { DealerCatalogService, type DealerProductDTO } from "./dealer-catalog-service";
export { DealerOrderService, type DealerOrderInput, type DealerOrderResult, type DealerOrderSummary } from "./dealer-order-service";
export { PublicLeadService, rateLimited, type QuoteRequestInput, type DealerApplicationInput, type PublicLeadResult } from "./public-lead-service";
export { PublicInstallerService, type PublicInstallerDTO, type InstallationOptions } from "./public-installer-service";
export { PublicConsumerLeadService, type ConsumerLeadResult } from "./public-consumer-lead-service";
export { PublicBrandService, type PublicBrandDTO } from "./public-brand-service";
export { PublicArticleService, type PublicArticleDTO } from "./public-article-service";
export { PublicReferralService, type SendToInstallerResult } from "./public-referral-service";
export { matchInstallerReferral, phoneKey, domainKey, nameKey, type MatchResult } from "./referral-matching";
export { matchesExclusion, isExcluded, addExclusion, findBlacklistMatch, type ExclusionRow } from "./exclusion-service";
export { dedupeKeyFor } from "./prospect-dedupe";
export { runReferralMaintenance } from "./referral-maintenance";
export { normalizeSizeInput, sizeNeedles, sizeSuggestion, type NormalizedSize } from "./size-normalize";
export { deriveSpecFromProduct, specGaps, validateSpecField, SPEC_FIELD_VOCAB, type RuleSpec } from "./spec-rules";
export { uploadDealerDoc, signDealerDocUrl, isDealerStorageConfigured } from "./storage";
export { recordEvent } from "./analytics";
export { isValidUsZip, zipDistanceMiles, zipCityState } from "./geo";
export { askClaudeJson } from "./claude-json";
export { fetchSiteText, extractEnrichment, type Enrichment } from "./prospect-enrich";
export { scoreProspect, assignStateLocation, RHINO_STATES, EVERFLOW_STATES, type ProspectVerdict, type SixCheck } from "./prospect-score";
export { searchPlacesPage, PLACES_COST_PER_CALL_USD, type PlaceCandidate } from "./places-collector";
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
export { runProspectingPipeline, PROSPECT_QUERIES, PROSPECT_STATE_NAMES, PROSPECT_COUNTRIES, type ProspectCategory, type PipelineResult } from "./prospect-pipeline";
export { generateOutreachDraft, type OutreachDraft } from "./prospect-draft";
export { findDecisionMakers, DECISION_TITLES, type ProspectContact } from "./contact-enrich";
