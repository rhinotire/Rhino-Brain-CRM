import { z } from "zod";

const optionalStr = z.string().trim().max(500).optional().or(z.literal("")).transform(v => v || undefined);
const optionalDate = z.string().optional().or(z.literal("")).transform(v => (v ? new Date(v) : undefined));
const optionalNum = z.string().optional().or(z.literal("")).transform(v => (v ? Number(v) : undefined))
  .refine(v => v === undefined || !Number.isNaN(v), "Must be a number");

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const customerSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  locationId: optionalStr,
  contactPerson: optionalStr,
  phone: optionalStr,
  contactCell: optionalStr,
  email: z.string().email().optional().or(z.literal("")).transform(v => v || undefined),
  website: optionalStr,
  facebookUrl: optionalStr,
  instagramUrl: optionalStr,
  whatsapp: optionalStr,
  address: optionalStr,
  city: optionalStr,
  state: optionalStr,
  zip: optionalStr,
  type: z.enum(["TIRE_SHOP","CAR_DEALER","TRAILER_MANUFACTURER","FLEET","REPAIR_SHOP","WHOLESALE_DEALER","ONLINE_BUYER","OTHER"]),
  status: z.enum(["LEAD","PROSPECT","ACTIVE","INACTIVE","LOST","DO_NOT_CONTACT"]),
  source: z.enum(["GOOGLE","FACEBOOK","REFERRAL","WALK_IN","EXISTING","COLD_CALL","WEBSITE","MARKETPLACE","OTHER"]),
  mainInterest: z.enum(["PCR_TIRES","LT_TIRES","TBR_TIRES","TRAILER_TIRES","WHEELS","TRAILER_PARTS","OIL_LUBRICANTS","OTHER"]),
  tier: z.enum(["A","B","C","D"]),
  creditLimit: optionalNum,
  paymentTerms: optionalStr,
  nextFollowUpAt: optionalDate,
  notes: z.string().max(5000).optional().or(z.literal("")).transform(v => v || undefined),
  assignedRepId: optionalStr,
});

export const leadSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  locationId: optionalStr,
  contactPerson: optionalStr,
  phone: optionalStr,
  email: z.string().email().optional().or(z.literal("")).transform(v => v || undefined),
  city: optionalStr,
  state: optionalStr,
  type: z.enum(["TIRE_SHOP","CAR_DEALER","TRAILER_MANUFACTURER","FLEET","REPAIR_SHOP","WHOLESALE_DEALER","ONLINE_BUYER","OTHER"]),
  source: z.enum(["GOOGLE","FACEBOOK","REFERRAL","WALK_IN","EXISTING","COLD_CALL","WEBSITE","MARKETPLACE","OTHER"]),
  interest: z.enum(["PCR_TIRES","LT_TIRES","TBR_TIRES","TRAILER_TIRES","WHEELS","TRAILER_PARTS","OIL_LUBRICANTS","OTHER"]),
  assignedRepId: optionalStr,
  nextFollowUpAt: optionalDate,
  notes: z.string().max(5000).optional().or(z.literal("")).transform(v => v || undefined),
});

export const activitySchema = z.object({
  customerId: optionalStr,
  leadId: optionalStr,
  type: z.enum(["CALL","EMAIL","TEXT","WHATSAPP","QUOTE","ORDER","PAYMENT","VISIT","COMPLAINT","INTERNAL_NOTE","NO_ANSWER","VOICEMAIL"]),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  notes: z.string().max(5000).optional().or(z.literal("")).transform(v => v || undefined),
  outcome: z.enum(["","POSITIVE","LOST_NO_STOCK","LOST_PRICE","LOST_OTHER"]).default("").transform(v => v || undefined),
  lostItem: optionalStr,
  lostQty: optionalNum,
  lostValue: optionalNum,
  lostCompetitor: optionalStr,
  lostCompetitorPrice: optionalNum,
  meaningful: z.boolean().default(false),
  followUpRequired: z.boolean().default(false),
  nextFollowUpAt: optionalDate,
  quoteId: optionalStr,
}).refine(d => d.customerId || d.leadId, { message: "An activity must be linked to a customer or a lead" });

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional().or(z.literal("")).transform(v => v || undefined),
  customerId: optionalStr,
  assigneeId: z.string().min(1, "Assignee is required"),
  dueDate: z.string().min(1, "Due date is required").transform(v => new Date(v)),
  priority: z.enum(["LOW","MEDIUM","HIGH","URGENT"]),
  type: z.enum(["CALL","FOLLOW_UP","QUOTE","PAYMENT","REACTIVATION","COMPLAINT","OTHER"]),
});

export const quoteItemSchema = z.object({
  category: z.enum(["PCR_TIRES","LT_TIRES","TBR_TIRES","TRAILER_TIRES","WHEELS","TRAILER_PARTS","OIL_LUBRICANTS","OTHER"]),
  description: z.string().trim().min(1).max(300),
  sizeSku: optionalStr,
  brand: optionalStr,
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
});

export const quoteSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  expirationDate: optionalDate,
  competitorPrice: optionalNum,
  competitorBrand: optionalStr,
  nextFollowUpAt: optionalDate,
  notes: z.string().max(5000).optional().or(z.literal("")).transform(v => v || undefined),
  items: z.array(quoteItemSchema).min(1, "Add at least one line item"),
});

export const opportunitySchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  category: z.enum(["PCR_TIRES","LT_TIRES","TBR_TIRES","TRAILER_TIRES","WHEELS","TRAILER_PARTS","OIL_LUBRICANTS","OTHER"]),
  estMonthlyVolume: optionalStr,
  currentSupplier: optionalStr,
  targetPrice: optionalNum,
  competitorBrand: optionalStr,
  probability: z.enum(["LOW","MEDIUM","HIGH"]),
  nextAction: optionalStr,
});

export const userSchema = z.object({
  name: z.string().trim().min(1).max(100),
  locationId: optionalStr,
  email: z.string().email(),
  password: z.string().min(6, "At least 6 characters").optional().or(z.literal("")).transform(v => v || undefined),
  role: z.enum(["ADMIN","MANAGER","SALES_REP","ACCOUNTING"]),
});
