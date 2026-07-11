/**
 * TirePro CRM — seed script
 * Run with: npm run db:seed
 * Demo logins (password for all: demo1234)
 *   owner@rhinobrain.com    (ADMIN)
 *   linda@rhinotireusa.com  (MANAGER)
 *   mike@rhinotireusa.com / sarah@rhinotireusa.com / carlos@rhinotireusa.com (SALES_REP)
 */
import { PrismaClient, CustomerType, CustomerStatus, CustomerSource, ProductCategory, Tier, PipelineStage, ActivityType, TaskPriority, TaskType, QuoteStatus, Probability } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const daysAgo = (n: number, hour = 10) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, 0, 0, 0); return d; };
const daysAhead = (n: number, hour = 10) => daysAgo(-n, hour);
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

async function main() {
  console.log("Seeding TirePro CRM…");
  const hash = await bcrypt.hash("demo1234", 10);

  // ---- Users ----
  const owner = await db.user.upsert({ where: { email: "owner@rhinobrain.com" }, update: {}, create: { email: "owner@rhinobrain.com", passwordHash: hash, name: "William Chen", role: "ADMIN" } });
  const manager = await db.user.upsert({ where: { email: "linda@rhinotireusa.com" }, update: {}, create: { email: "linda@rhinotireusa.com", passwordHash: hash, name: "Linda Torres", role: "MANAGER" } });
  const mike = await db.user.upsert({ where: { email: "mike@rhinotireusa.com" }, update: {}, create: { email: "mike@rhinotireusa.com", passwordHash: hash, name: "Mike Johnson", role: "SALES_REP" } });
  const sarah = await db.user.upsert({ where: { email: "sarah@rhinotireusa.com" }, update: {}, create: { email: "sarah@rhinotireusa.com", passwordHash: hash, name: "Sarah Kim", role: "SALES_REP" } });
  const carlos = await db.user.upsert({ where: { email: "carlos@rhinotireusa.com" }, update: {}, create: { email: "carlos@rhinotireusa.com", passwordHash: hash, name: "Carlos Rivera", role: "SALES_REP" } });
  // ---- Locations (v2) ----
  const rhino = await db.location.upsert({
    where: { name: "Rhino Tire USA" }, update: {},
    create: { name: "Rhino Tire USA", city: "Orlando, FL", shortTag: "FL", color: "#e8590c" },
  });
  const everflow = await db.location.upsert({
    where: { name: "Everflow Tire" }, update: {},
    create: { name: "Everflow Tire", city: "Dallas, TX", shortTag: "TX", color: "#1d4ed8" },
  });
  // Owner (ADMIN) keeps locationId = null → sees all locations
  await db.user.updateMany({ where: { email: { in: ["linda@rhinotireusa.com", "mike@rhinotireusa.com", "sarah@rhinotireusa.com", "carlos@rhinotireusa.com"] } }, data: { locationId: rhino.id } });
  const jake = await db.user.upsert({ where: { email: "jake@everflowtire.com" }, update: {}, create: { email: "jake@everflowtire.com", passwordHash: hash, name: "Jake Miller", role: "SALES_REP", locationId: everflow.id } });
  const amy = await db.user.upsert({ where: { email: "amy@everflowtire.com" }, update: {}, create: { email: "amy@everflowtire.com", passwordHash: hash, name: "Amy Rodriguez", role: "SALES_REP", locationId: everflow.id } });

  const reps = [mike, sarah, carlos];
  const txReps = [jake, amy];

  if (await db.customer.count() > 0) { console.log("Data already present — skipping (drop DB to reseed)."); return; }

  // ---- Customers (30) ----
  const cities: [string, string][] = [["Orlando","FL"],["Tampa","FL"],["Kissimmee","FL"],["Lakeland","FL"],["Ocala","FL"],["Jacksonville","FL"],["Daytona Beach","FL"],["Fort Myers","FL"],["Sanford","FL"],["Clermont","FL"],["Valdosta","GA"],["Savannah","GA"]];
  const types: CustomerType[] = ["TIRE_SHOP","TIRE_SHOP","TIRE_SHOP","CAR_DEALER","FLEET","TRAILER_MANUFACTURER","REPAIR_SHOP","WHOLESALE_DEALER"];
  const interests: ProductCategory[] = ["PCR_TIRES","LT_TIRES","TRAILER_TIRES","TBR_TIRES","WHEELS","TRAILER_PARTS"];
  const sources: CustomerSource[] = ["COLD_CALL","REFERRAL","GOOGLE","EXISTING","WALK_IN","MARKETPLACE"];
  const companyNames = [
    "Sunshine Tire & Auto","Orlando Discount Tires","Gator Wheel Depot","Bay Area Fleet Services","Superior Trailer Mfg",
    "QuickFix Auto Repair","Central FL Tire Wholesale","Magic City Motors","EagleLine Trailers","Tampa Tire Outlet",
    "AllPro Tire Center","Lakeside Auto Sales","RoadKing Fleet Solutions","Coastal Trailer Works","Precision Tire & Wheel",
    "Family Auto Care","Sunbelt Tire Distributors","Metro Car Superstore","Longhaul Trailer Supply","Neighborhood Tire Pros",
    "Interstate Fleet Maintenance","Palm Tire Company","Champion Auto Group","TrailMaster Manufacturing","Budget Tire Barn",
    "Elite Wheel Warehouse","First Choice Auto Repair","Gulf Coast Tire & Service","Southern Fleet Partners","Ace Trailer Parts",
  ];
  const contacts = ["Tony Nguyen","Maria Garcia","James Smith","Ashley Brown","David Lee","Kevin Patel","Rosa Martinez","Bill Thompson","Angela White","Sam Wilson"];

  // Spread lastContactAt to produce all temperature bands: 1,3,5 (hot) 10,20 (warm) 35,45 (cooling) 65,80 (inactive) 100+ (lost)
  const contactSpread = [1,2,3,4,5,6,8,10,12,15,18,21,25,28,33,38,42,50,55,58,62,70,78,85,95,105,120,150,null,null];
  const tiers: Tier[] = ["A","A","A","B","B","B","B","B","C","C","C","C","C","C","D"];

  const customers = [];
  for (let i = 0; i < 30; i++) {
    const rep = pick(reps, i);
    const [city, state] = pick(cities, i);
    const lc = contactSpread[i];
    const interest = pick(interests, i);
    const c = await db.customer.create({
      data: {
        companyName: companyNames[i],
        contactPerson: pick(contacts, i),
        phone: `(407) 555-0${String(100 + i)}`,
        email: `contact@${companyNames[i].toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
        address: `${100 + i * 7} Industrial Blvd`,
        city, state, zip: `328${String(10 + i).padStart(2, "0")}`,
        type: pick(types, i),
        status: lc !== null && lc > 100 ? "INACTIVE" : "ACTIVE",
        source: pick(sources, i),
        mainInterest: interest,
        interests: [interest, pick(interests, i + 2)].filter((v, x, a) => a.indexOf(v) === x),
        tier: pick(tiers, i),
        paymentTerms: i % 3 === 0 ? "Net 30" : i % 3 === 1 ? "Net 15" : "COD",
        creditLimit: i % 3 === 0 ? 25000 : i % 3 === 1 ? 10000 : null,
        lastContactAt: lc === null ? null : daysAgo(lc),
        nextFollowUpAt: i % 4 === 0 ? daysAgo(2) : i % 4 === 1 ? daysAhead(0, 14) : i % 4 === 2 ? daysAhead(3) : null,
        assignedRepId: rep.id,
        locationId: rhino.id,
        score: Math.max(10, 95 - i * 3),
        notes: i % 5 === 0 ? "Prefers WhatsApp. Asks for container pricing on ST tires." : null,
      },
    });
    customers.push(c);
  }

  // ---- Leads (20) ----
  const leadNames = [
    "Twin Oaks Tire","Velocity Auto Mall","Hurricane Trailer Co","Riverside Repair","Peak Fleet Logistics",
    "Discount Wheel City","Sunrise Auto Sales","Big Bend Trailers","MaxGrip Tire Shop","Delta Truck Service",
    "Golden Mile Motors","Everglade Trailer Supply","Rapid Lube & Tire","Skyway Fleet Group","ProTread Tires",
    "Union Auto Brokers","Seminole Tire House","Crossroads Trailer Mfg","Victory Wheel & Tire","Landmark Auto Repair",
  ];
  const stages: PipelineStage[] = ["NEW_LEAD","NEW_LEAD","NEW_LEAD","NEW_LEAD","CONTACTED","CONTACTED","CONTACTED","CONTACTED","INTERESTED","INTERESTED","INTERESTED","QUOTED","QUOTED","QUOTED","NEGOTIATING","NEGOTIATING","FIRST_ORDER","LOST","LOST","LOST"];
  const leads = [];
  for (let i = 0; i < 20; i++) {
    const stage = stages[i];
    const created = daysAgo(2 + i);
    const [city, state] = pick(cities, i + 3);
    const l = await db.lead.create({
      data: {
        companyName: leadNames[i],
        contactPerson: pick(contacts, i + 4),
        phone: `(321) 555-0${String(200 + i)}`,
        email: i % 2 === 0 ? `info@${leadNames[i].toLowerCase().replace(/[^a-z0-9]+/g, "")}.com` : null,
        city, state,
        type: pick(types, i + 1),
        source: pick(sources, i + 2),
        interest: pick(interests, i + 1),
        stage,
        // First 2 NEW_LEADs are stale (3+ days, no activity) to trigger "Needs First Contact"
        lastActivityAt: stage === "NEW_LEAD" ? (i < 2 ? null : daysAgo(1)) : daysAgo(Math.min(i, 6)),
        nextFollowUpAt: stage === "NEGOTIATING" || stage === "QUOTED" ? daysAhead(1 + (i % 3)) : null,
        lostReason: stage === "LOST" ? (i % 2 === 0 ? "PRICE_TOO_HIGH" : "BOUGHT_FROM_COMPETITOR") : null,
        lostNote: stage === "LOST" && i % 2 === 0 ? "Competitor quoted $4/tire less on ST205/75R15" : null,
        assignedRepId: i < 18 ? pick(reps, i).id : null, // a couple unassigned for the manager to distribute
        locationId: rhino.id,
        createdAt: created,
      },
    });
    leads.push(l);
  }

  // ---- Quotes (15) ----
  const quoteSpecs: { status: QuoteStatus; sentDaysAgo: number | null; custIdx: number; repIdx: number; followUpDaysAgo?: number }[] = [
    { status: "DRAFT", sentDaysAgo: null, custIdx: 0, repIdx: 0 },
    { status: "DRAFT", sentDaysAgo: null, custIdx: 5, repIdx: 1 },
    { status: "SENT", sentDaysAgo: 1, custIdx: 1, repIdx: 0 },
    { status: "SENT", sentDaysAgo: 2, custIdx: 6, repIdx: 1 },
    { status: "SENT", sentDaysAgo: 5, custIdx: 2, repIdx: 2 },   // triggers follow-up rule
    { status: "SENT", sentDaysAgo: 7, custIdx: 9, repIdx: 0 },   // triggers follow-up rule
    { status: "FOLLOW_UP_NEEDED", sentDaysAgo: 6, custIdx: 12, repIdx: 1 },
    { status: "ACCEPTED", sentDaysAgo: 10, custIdx: 3, repIdx: 0 },
    { status: "ACCEPTED", sentDaysAgo: 15, custIdx: 7, repIdx: 1 },
    { status: "ACCEPTED", sentDaysAgo: 20, custIdx: 10, repIdx: 2 },
    { status: "ACCEPTED", sentDaysAgo: 4, custIdx: 14, repIdx: 0 },
    { status: "REJECTED", sentDaysAgo: 12, custIdx: 4, repIdx: 2 },
    { status: "REJECTED", sentDaysAgo: 18, custIdx: 8, repIdx: 1 },
    { status: "EXPIRED", sentDaysAgo: 40, custIdx: 11, repIdx: 0 },
    { status: "SENT", sentDaysAgo: 0, custIdx: 13, repIdx: 2 },
  ];
  const itemBank = [
    { category: "PCR_TIRES" as ProductCategory, description: "All-Season Touring Tire", sizeSku: "205/55R16", brand: "Fullway", unitPrice: 42.5 },
    { category: "PCR_TIRES" as ProductCategory, description: "UHP Summer Tire", sizeSku: "225/45R17", brand: "Lionhart", unitPrice: 51 },
    { category: "LT_TIRES" as ProductCategory, description: "All-Terrain LT Tire", sizeSku: "LT265/70R17", brand: "Haida", unitPrice: 98 },
    { category: "TRAILER_TIRES" as ProductCategory, description: "ST Radial Trailer Tire", sizeSku: "ST205/75R15", brand: "Freedom Hauler", unitPrice: 46 },
    { category: "TRAILER_TIRES" as ProductCategory, description: "ST Radial Trailer Tire 10-ply", sizeSku: "ST235/80R16", brand: "Transeagle", unitPrice: 68 },
    { category: "TBR_TIRES" as ProductCategory, description: "Drive Position TBR", sizeSku: "11R22.5", brand: "Kapsen", unitPrice: 235 },
    { category: "WHEELS" as ProductCategory, description: "Steel Trailer Wheel", sizeSku: '15x6 6-lug', brand: "", unitPrice: 38 },
    { category: "TRAILER_PARTS" as ProductCategory, description: "Trailer Hub Kit", sizeSku: "84-3535", brand: "", unitPrice: 29 },
  ];
  let quoteNo = 1;
  for (const spec of quoteSpecs) {
    const cust = customers[spec.custIdx];
    const rep = reps[spec.repIdx];
    const its = [pick(itemBank, quoteNo), pick(itemBank, quoteNo + 3)];
    const qty = [40 + quoteNo * 4, 12 + quoteNo * 2];
    const total = its.reduce((s, it, x) => s + it.unitPrice * qty[x], 0);
    const sentAt = spec.sentDaysAgo === null ? null : daysAgo(spec.sentDaysAgo, 11);
    const decided = spec.status === "ACCEPTED" || spec.status === "REJECTED";
    await db.quote.create({
      data: {
        quoteNumber: `Q${new Date().getFullYear()}-${String(quoteNo++).padStart(4, "0")}`,
        quoteDate: sentAt ?? daysAgo(1),
        expirationDate: sentAt ? daysAhead(30 - (spec.sentDaysAgo ?? 0)) : null,
        status: spec.status,
        sentAt,
        decidedAt: decided ? daysAgo(Math.max(0, (spec.sentDaysAgo ?? 3) - 3), 15) : null,
        lastFollowUpAt: spec.followUpDaysAgo ? daysAgo(spec.followUpDaysAgo) : null,
        nextFollowUpAt: spec.status === "SENT" && (spec.sentDaysAgo ?? 0) <= 2 ? daysAhead(2) : null,
        competitorPrice: quoteNo % 3 === 0 ? 44.0 : null,
        competitorBrand: quoteNo % 3 === 0 ? "Westlake" : null,
        total,
        customerId: cust.id,
        repId: rep.id,
        locationId: rhino.id,
        items: {
          create: its.map((it, x) => ({
            category: it.category, description: it.description, sizeSku: it.sizeSku, brand: it.brand || null,
            quantity: qty[x], unitPrice: it.unitPrice, lineTotal: it.unitPrice * qty[x],
          })),
        },
      },
    });
  }

  // ---- Activities (50) ----
  const actTypes: ActivityType[] = ["CALL","CALL","CALL","NO_ANSWER","VOICEMAIL","EMAIL","TEXT","WHATSAPP","VISIT","QUOTE","ORDER","INTERNAL_NOTE"];
  const subjects: Record<string, string> = {
    CALL: "Phone call — discussed restock needs", NO_ANSWER: "Called — no answer", VOICEMAIL: "Left voicemail about ST tire promo",
    EMAIL: "Emailed container pricing sheet", TEXT: "Texted delivery ETA", WHATSAPP: "WhatsApp — sent wheel catalog photos",
    VISIT: "In-person visit — walked warehouse", QUOTE: "Prepared and sent quote", ORDER: "Placed order — 60 ST205 tires",
    INTERNAL_NOTE: "Internal note — check credit before next order",
  };
  for (let i = 0; i < 50; i++) {
    const type = pick(actTypes, i);
    const meaningful = ["CALL","VISIT","WHATSAPP","ORDER"].includes(type) && i % 3 !== 0;
    const toLead = i % 6 === 5;
    const lead = toLead ? leads[i % leads.length] : null;
    const cust = toLead ? null : customers[i % customers.length];
    const rep = pick(reps, i);
    await db.activity.create({
      data: {
        type,
        subject: subjects[type] ?? "Activity",
        notes: i % 4 === 0 ? "Asked about 11R22.5 drive tires availability and fleet pricing." : null,
        meaningful,
        occurredAt: daysAgo(i % 14, 8 + (i % 9)),
        customerId: cust?.id ?? null,
        leadId: lead?.id ?? null,
        repId: rep.id,
        locationId: rhino.id,
      },
    });
  }

  // ---- Tasks (20) ----
  const taskSpecs: { title: string; type: TaskType; priority: TaskPriority; dueIn: number; done?: boolean; custIdx?: number }[] = [
    { title: "Call back about ST235 container split", type: "CALL", priority: "HIGH", dueIn: -2, custIdx: 2 },
    { title: "Follow up on Q quote — fleet account", type: "FOLLOW_UP", priority: "URGENT", dueIn: -1, custIdx: 3 },
    { title: "Collect payment — Net 30 overdue", type: "PAYMENT", priority: "HIGH", dueIn: 0, custIdx: 7 },
    { title: "Send wheel catalog to trailer mfg", type: "OTHER", priority: "MEDIUM", dueIn: 0, custIdx: 4 },
    { title: "Reactivate — 60+ days silent", type: "REACTIVATION", priority: "MEDIUM", dueIn: 1, custIdx: 22 },
    { title: "Quote 11R22.5 for RoadKing Fleet", type: "QUOTE", priority: "HIGH", dueIn: 1, custIdx: 12 },
    { title: "Resolve complaint — wrong size shipped", type: "COMPLAINT", priority: "URGENT", dueIn: 0, custIdx: 9 },
    { title: "Verify new credit application", type: "OTHER", priority: "LOW", dueIn: 3, custIdx: 15 },
    { title: "Schedule warehouse visit", type: "OTHER", priority: "LOW", dueIn: 5, custIdx: 1 },
    { title: "Call new lead list from trade show", type: "CALL", priority: "MEDIUM", dueIn: 2 },
    { title: "Prepare monthly pricing sheet", type: "OTHER", priority: "MEDIUM", dueIn: 4 },
    { title: "Follow up on trailer parts sample", type: "FOLLOW_UP", priority: "MEDIUM", dueIn: 2, custIdx: 29 },
    { title: "Reactivation call — Palm Tire", type: "REACTIVATION", priority: "HIGH", dueIn: 1, custIdx: 21 },
    { title: "Confirm delivery slot Friday", type: "OTHER", priority: "LOW", dueIn: 1, custIdx: 0 },
    { title: "Update fleet contract pricing", type: "QUOTE", priority: "MEDIUM", dueIn: 6, custIdx: 12 },
    { title: "Call about winter LT stock", type: "CALL", priority: "LOW", dueIn: 7, custIdx: 14 },
    { title: "Chase quote decision — Metro Car", type: "FOLLOW_UP", priority: "HIGH", dueIn: -3, custIdx: 17 },
    { title: "Completed: sent W-9 to new account", type: "OTHER", priority: "LOW", dueIn: -4, done: true, custIdx: 6 },
    { title: "Completed: intro call new lead", type: "CALL", priority: "MEDIUM", dueIn: -2, done: true },
    { title: "Completed: emailed catalog", type: "OTHER", priority: "LOW", dueIn: -5, done: true, custIdx: 10 },
  ];
  for (let i = 0; i < taskSpecs.length; i++) {
    const t = taskSpecs[i];
    const assignee = pick(reps, i);
    await db.task.create({
      data: {
        title: t.title,
        type: t.type,
        priority: t.priority,
        status: t.done ? "COMPLETED" : "OPEN",
        completedAt: t.done ? daysAgo(1) : null,
        dueDate: daysAhead(t.dueIn, 17),
        customerId: t.custIdx !== undefined ? customers[t.custIdx].id : null,
        assigneeId: assignee.id,
        creatorId: i % 3 === 0 ? manager.id : assignee.id,
        locationId: rhino.id,
      },
    });
  }

  // ---- Opportunities (10) ----
  const oppSpecs: { custIdx: number; category: ProductCategory; vol: string; supplier: string; target: number; prob: Probability; action: string }[] = [
    { custIdx: 0, category: "TRAILER_TIRES", vol: "300 tires/mo", supplier: "Local distributor", target: 44, prob: "HIGH", action: "Send container program pricing" },
    { custIdx: 3, category: "TBR_TIRES", vol: "80 tires/mo", supplier: "TCi", target: 225, prob: "MEDIUM", action: "Quote 11R22.5 drive + trailer positions" },
    { custIdx: 4, category: "WHEELS", vol: "500 wheels/mo", supplier: "Direct import", target: 35, prob: "MEDIUM", action: "Provide 15x6 6-lug sample" },
    { custIdx: 6, category: "PCR_TIRES", vol: "600 tires/mo", supplier: "ATD", target: 40, prob: "HIGH", action: "Match ATD pricing on touring line" },
    { custIdx: 8, category: "TRAILER_PARTS", vol: "$4k/mo", supplier: "eTrailer", target: 0, prob: "LOW", action: "Send hub & bearing kit price list" },
    { custIdx: 12, category: "TBR_TIRES", vol: "120 tires/mo", supplier: "Southern Tire Mart", target: 230, prob: "HIGH", action: "Fleet contract proposal by Friday" },
    { custIdx: 14, category: "LT_TIRES", vol: "150 tires/mo", supplier: "NTW", target: 92, prob: "MEDIUM", action: "Quote AT and MT lines" },
    { custIdx: 17, category: "PCR_TIRES", vol: "250 tires/mo", supplier: "Unknown", target: 41, prob: "LOW", action: "Discovery call on volumes" },
    { custIdx: 23, category: "TRAILER_TIRES", vol: "400 tires/mo", supplier: "Trailer Tires Direct", target: 45, prob: "MEDIUM", action: "Offer drop-ship program" },
    { custIdx: 26, category: "WHEELS", vol: "200 wheels/mo", supplier: "Local distributor", target: 36, prob: "LOW", action: "Send aluminum wheel catalog" },
  ];
  for (let i = 0; i < oppSpecs.length; i++) {
    const o = oppSpecs[i];
    await db.opportunity.create({
      data: {
        category: o.category,
        estMonthlyVolume: o.vol,
        currentSupplier: o.supplier,
        targetPrice: o.target || null,
        probability: o.prob,
        nextAction: o.action,
        customerId: customers[o.custIdx].id,
        repId: pick(reps, i).id,
        locationId: rhino.id,
      },
    });
  }

  // ---- Product catalog (v2, 15 SKUs with tiered pricing) ----
  const productSpecs: [string, string, ProductCategory, string, string, number][] = [
    // sku, brand, category, size, description, cost  (prices derived: A=cost*1.18, B=*1.25, C=*1.32, D=*1.40)
    ["FW-2055516", "Fullway", "PCR_TIRES", "205/55R16", "HP108 All-Season Touring", 36.0],
    ["FW-2256517", "Fullway", "PCR_TIRES", "225/65R17", "HP108 All-Season Touring", 44.5],
    ["LH-2254517", "Lionhart", "PCR_TIRES", "225/45R17", "LH-503 UHP Summer", 43.0],
    ["HD-LT26570", "Haida", "LT_TIRES", "LT265/70R17", "HD878 All-Terrain 10-ply", 82.0],
    ["HD-LT28575", "Haida", "LT_TIRES", "LT285/75R16", "HD868 Mud-Terrain", 96.0],
    ["FH-ST20575", "Freedom Hauler", "TRAILER_TIRES", "ST205/75R15", "ST Radial 8-ply", 38.5],
    ["TE-ST23580", "Transeagle", "TRAILER_TIRES", "ST235/80R16", "ST Radial 10-ply", 57.0],
    ["TE-ST22575", "Transeagle", "TRAILER_TIRES", "ST225/75R15", "ST Radial 8-ply", 43.0],
    ["KP-11R225D", "Kapsen", "TBR_TIRES", "11R22.5", "HS208 Drive Position 16-ply", 198.0],
    ["KP-11R225T", "Kapsen", "TBR_TIRES", "11R22.5", "HS205 Trailer Position 16-ply", 189.0],
    ["KP-29575D", "Kapsen", "TBR_TIRES", "295/75R22.5", "HS208 Drive Position", 202.0],
    ["WH-15660", "", "WHEELS", "15x6 6-lug", "Steel Trailer Wheel White Spoke", 27.0],
    ["WH-16665", "", "WHEELS", "16x6 6-lug", "Steel Trailer Wheel Silver Mod", 33.0],
    ["TP-HUB84", "", "TRAILER_PARTS", "84-3535", "Trailer Hub Kit 3500lb", 21.0],
    ["TP-AXL35", "", "TRAILER_PARTS", "AX-3500", "Idler Axle 3500lb 89in", 118.0],
  ];
  const products = [] as { id: string; sku: string; cost: number }[];
  for (const [sku, brand, category, sizeSpec, description, cost] of productSpecs) {
    const p = await db.product.create({
      data: {
        sku, brand: brand || null, category, sizeSpec, description, cost,
        priceA: +(cost * 1.18).toFixed(2), priceB: +(cost * 1.25).toFixed(2),
        priceC: +(cost * 1.32).toFixed(2), priceD: +(cost * 1.40).toFixed(2),
      },
    });
    products.push({ id: p.id, sku, cost });
  }

  // ---- Inventory snapshots (both locations) ----
  for (let i = 0; i < products.length; i++) {
    await db.inventorySnapshot.create({ data: { productId: products[i].id, locationId: rhino.id, quantity: 60 + ((i * 37) % 340) } });
    await db.inventorySnapshot.create({ data: { productId: products[i].id, locationId: everflow.id, quantity: 20 + ((i * 53) % 220) } });
  }

  // ---- TX branch: 5 Everflow customers ----
  const txCustSpecs: [string, string, string, string, CustomerType, Tier, ProductCategory, number, number][] = [
    // name, contact, phone, city, type, tier, interest, repIdx, lastContactDaysAgo
    ["Lone Star Tire Co", "Hector Ramos", "(214) 555-0300", "Dallas", "TIRE_SHOP", "A", "PCR_TIRES", 0, 2],
    ["Big D Fleet Services", "Tanya Brooks", "(214) 555-0301", "Dallas", "FLEET", "A", "TBR_TIRES", 0, 6],
    ["Texas Trailer Supply", "Ray Delgado", "(817) 555-0302", "Fort Worth", "TRAILER_MANUFACTURER", "B", "TRAILER_TIRES", 1, 15],
    ["Metroplex Auto Group", "Wendy Liu", "(972) 555-0303", "Plano", "CAR_DEALER", "B", "PCR_TIRES", 1, 33],
    ["Alamo Wholesale Tires", "George Kim", "(682) 555-0304", "Arlington", "WHOLESALE_DEALER", "C", "LT_TIRES", 0, 70],
  ];
  const txCustomers = [] as { id: string; tier: string }[];
  for (const [companyName, contactPerson, phone, city, type, tier, mainInterest, repIdx, lc] of txCustSpecs) {
    const c = await db.customer.create({
      data: {
        companyName, contactPerson, phone, city, state: "TX",
        type, status: "ACTIVE", source: "EXISTING", mainInterest, interests: [mainInterest],
        tier, lastContactAt: daysAgo(lc), assignedRepId: txReps[repIdx].id, locationId: everflow.id,
        score: 80 - lc,
      },
    });
    txCustomers.push({ id: c.id, tier });
  }

  // ---- Orders over the last 90 days (v2) ----
  // FL: steady buyers + one declining customer (Metro Car Superstore, idx 17) for the purchase-decline alert demo.
  const tierPrice = (cost: number, tier: string) => +(cost * (tier === "A" ? 1.18 : tier === "B" ? 1.25 : tier === "C" ? 1.32 : 1.40)).toFixed(2);
  let orderNo = 50001;
  const mkOrder = async (customerId: string, locationId: string, dAgo: number, tier: string, lines: [number, number][]) => {
    // lines: [productIdx, qty][]
    let total = 0;
    const items = lines.map(([pi, qty]) => {
      const unit = tierPrice(products[pi].cost, tier);
      total += unit * qty;
      return { productId: products[pi].id, rawDescription: productSpecs[pi][4] + " " + (productSpecs[pi][3] ?? ""), quantity: qty, unitPrice: unit, lineTotal: +(unit * qty).toFixed(2) };
    });
    await db.order.create({
      data: {
        externalId: "TG-" + orderNo++, customerId, locationId,
        orderDate: daysAgo(dAgo, 13), total: +total.toFixed(2), source: "TIREGURU_CSV",
        items: { create: items },
      },
    });
  };

  // Steady FL buyers: Sunshine(0,A), Bay Area Fleet(3,B), Central FL(5,A), RoadKing(7,A), Superior(4,B)
  const steady: [number, [number, number][]][] = [
    [0, [[5, 40], [7, 12]]], [3, [[8, 10], [3, 8]]], [5, [[0, 60], [2, 20]]], [7, [[8, 14], [10, 6]]], [4, [[6, 30], [13, 20]]],
  ];
  for (const [ci, lines] of steady) {
    for (const dAgo of [82, 68, 55, 41, 27, 13, 5]) {
      await mkOrder(customers[ci].id, rhino.id, dAgo + (ci % 4), (["A","A","A","B","B","A","C","A"][ci] ?? "B"), lines);
    }
  }
  // Declining customer: Metro Car Superstore (idx 11 in customers array) — heavy 90-30d ago, light last 30d
  for (const dAgo of [85, 74, 63, 52, 44, 36]) await mkOrder(customers[11].id, rhino.id, dAgo, "C", [[0, 40]]);
  await mkOrder(customers[11].id, rhino.id, 12, "C", [[0, 8]]); // sharp drop → alert should fire
  // TX orders
  for (const dAgo of [60, 40, 20, 6]) await mkOrder(txCustomers[0].id, everflow.id, dAgo, "A", [[0, 48], [1, 12]]);
  for (const dAgo of [50, 25, 8]) await mkOrder(txCustomers[1].id, everflow.id, dAgo, "A", [[8, 12], [9, 12]]);
  await mkOrder(txCustomers[2].id, everflow.id, 18, "B", [[6, 60], [11, 24]]);

  // ---- A few notifications ----
  await db.notification.createMany({
    data: [
      { userId: mike.id, type: "QUOTE_FOLLOW_UP", title: "Quote needs follow-up", body: "Q sent 5 days ago to Central FL Tire Wholesale has no follow-up logged." },
      { userId: sarah.id, type: "TASK_OVERDUE", title: "Task overdue", body: "Follow up on quote — fleet account was due yesterday." },
      { userId: carlos.id, type: "LEAD_ASSIGNED", title: "New lead assigned", body: "Hurricane Trailer Co was assigned to you." },
    ],
  });

  console.log("✔ Seed complete.");
  console.log("Logins (password demo1234): owner@rhinobrain.com (all locations) · linda@rhinotireusa.com (Rhino FL) · mike@/sarah@/carlos@rhinotireusa.com (Rhino FL) · jake@/amy@everflowtire.com (Everflow TX)");
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
