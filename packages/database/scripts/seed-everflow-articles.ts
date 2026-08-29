/**
 * EVERFLOW knowledge-center articles (master instruction §6.13) — 12 launch
 * articles, DFW/B2B angle, distinct slugs+content from the RHINO library
 * (docs/everflow-website-plan.md §4: never ship identical content on both
 * domains). Facts are standard published tire-industry values; anything
 * load/pressure-critical tells the reader to verify the sidewall/placard.
 * Run: pnpm exec tsx scripts/seed-everflow-articles.ts   (uses DATABASE_URL)
 */
import { PrismaClient } from "@prisma/client";

const AUTHOR = "Everflow Tires & Wheels Team";

const ARTICLES: { slug: string; title: string; description: string; answer: string; bodyMd: string }[] = [
  {
    slug: "st-trailer-tire-sizes-explained",
    title: "ST Trailer Tire Sizes Explained: What the Numbers on Your Trailer Tire Mean",
    description:
      "ST205/75R15, ST235/80R16 — what every part of an ST trailer tire size means, the common sizes, and how to confirm the right one for your trailer.",
    answer:
      "An ST tire size like ST205/75R15 reads: ST = Special Trailer (trailer use only), 205 = section width in millimeters, 75 = sidewall height as a percentage of width, R = radial construction, 15 = wheel diameter in inches. The correct size and load range for your trailer are listed on the trailer's VIN/certification plate.",
    bodyMd: `## The anatomy of an ST tire size

Take **ST205/75R15** — the most common trailer tire size in North America:

| Part | Meaning |
| --- | --- |
| **ST** | Special Trailer — engineered for trailer axles only, never for drive or steer positions |
| **205** | Section width in millimeters (~8.1") |
| **75** | Aspect ratio — sidewall height is 75% of the width |
| **R** | Radial construction (bias-ply versions use a D, e.g. ST205/75D15) |
| **15** | Fits a 15-inch wheel |

After the size you'll see a **load range letter** (C, D, E…) or a ply rating (6PR, 8PR…) — that's the strength spec, covered in our [load range guide](/knowledge/trailer-tire-load-range-guide).

## The sizes that move in Texas

From our Dallas warehouse, five sizes cover the huge majority of utility, cargo, boat and equipment trailers:

- **ST175/80R13** — light utility and small boat trailers
- **ST205/75R14** — mid-size single-axle trailers
- **ST205/75R15** — the workhorse: utility, landscape, small enclosed
- **ST225/75R15** — heavier tandem-axle utility and car haulers
- **ST235/80R16** — heavy equipment, gooseneck, large enclosed trailers

## Why "ST" is not optional

ST tires use stiffer sidewalls and different rubber compounds than passenger (P) or light-truck (LT) tires. They're built to take vertical load and side-scrub in tandem configurations, not to grip like a drive tire. Putting passenger tires on a trailer axle is the classic cause of highway blowouts.

## How to confirm the right size

1. Read the trailer's **VIN/certification plate** (usually on the tongue or frame) — it lists the original size AND required load range.
2. Match or exceed the plate. Never go down in load range.
3. If the plate is missing, match what's currently mounted and verify total tire capacity exceeds the trailer's GVWR — our [trailer load calculator](/tools/trailer-load-calculator) does the math.

Product fitment, load capacity, pressure, and application must always be verified against the trailer, wheel, and tire manufacturer specifications.

**Buying for a shop, dealership, or trailer plant?** Browse [ST trailer tires in stock in Dallas](/tires/st-trailer) or [request wholesale pricing](/quote) — most quotes answered within one business day.`,
  },
  {
    slug: "st205-vs-st225-trailer-tires",
    title: "ST205/75R15 vs ST225/75R15: Which Trailer Tire Does Your Build Need?",
    description:
      "The two best-selling 15-inch trailer tire sizes compared: dimensions, load capacity, wheel compatibility, and when trailer builders spec each one.",
    answer:
      "ST225/75R15 is about 20 mm wider and roughly 1.2 inches taller than ST205/75R15, and carries several hundred pounds more per tire at the same load range. Trailer manufacturers typically spec ST205/75R15 on single-axle utility trailers and step up to ST225/75R15 on tandem axles and heavier builds. The two sizes are not interchangeable without checking fender clearance and wheel width.",
    bodyMd: `## Side by side

| Spec (typical radial) | ST205/75R15 | ST225/75R15 |
| --- | --- | --- |
| Section width | ~205 mm (8.1") | ~225 mm (8.9") |
| Overall diameter | ~27.1" | ~28.3" |
| Common load ranges | C, D | D, E |
| Typical rim width | 5–6.5" | 6–7" |
| Typical use | Single-axle utility, landscape, small enclosed | Tandem car haulers, larger enclosed, heavier utility |

Exact capacity depends on the load range and inflation printed on the sidewall — always verify against the tire you're actually buying.

## When the 205 is the right call

Lighter single-axle builds where the certification plate calls for it. It's cheaper, fits narrower fenders, and at load range C or D covers most 2,990–3,500 lb GVWR trailers.

## When to step up to the 225

- Tandem-axle builds where per-tire load climbs
- Car haulers and equipment trailers that see full-GVWR loading
- Any spec sheet that calls for load range D/E capacity with 15" wheels

The extra inch of diameter also drops revolutions per mile slightly — marginally cooler running on long Texas interstate pulls.

## Can you swap one for the other?

Only if all three check out: (1) fender/frame clearance for the taller, wider tire; (2) wheel width in the approved range; (3) total capacity still meets the certification plate. When in doubt, match the plate.

## For trailer manufacturers

We keep both sizes — tires and [mounted tire-and-wheel assemblies](/packages) — in our Dallas warehouse for production-line supply across Dallas–Fort Worth. [Request factory supply pricing](/quote) or see [how our dealer program works](/become-a-dealer).`,
  },
  {
    slug: "trailer-tire-load-range-guide",
    title: "How to Choose the Correct Trailer Tire Load Range (C, D, E, F, G)",
    description:
      "Trailer tire load ranges from C to G: what each letter means, how to read your trailer's certification plate, and why you can never go below it.",
    answer:
      "A trailer tire's load range letter (C, D, E, F, G) indicates its strength and maximum inflation pressure — later letters carry more weight at higher pressure. Choose by reading the trailer's VIN/certification plate: fit the load range it specifies or higher, never lower, and inflate to the pressure molded on the sidewall for full capacity.",
    bodyMd: `## What the letters mean

| Load range | Ply rating equivalent | Typical max pressure |
| --- | --- | --- |
| C | 6PR | ~50 psi |
| D | 8PR | ~65 psi |
| E | 10PR | ~80 psi |
| F | 12PR | ~95 psi |
| G | 14PR | ~110 psi |

The letter is shorthand for the tire's construction strength. A load range D tire of a given size carries more than the C — **but only when inflated to its higher rated pressure**. A D tire aired to 50 psi carries roughly what the C does.

## The three-step selection method

1. **Read the certification plate** on the trailer tongue or frame — it states tire size and minimum load range.
2. **Check the math**: combined capacity of all tires must exceed the trailer's GVWR with margin. Example: a 7,000 lb tandem on four tires needs at least 1,750 lb per tire — real-world specs add cushion for uneven loading. Run your numbers in our [trailer load calculator](/tools/trailer-load-calculator).
3. **Inflate to the sidewall maximum** (cold). Trailer tires run at max pressure, unlike truck tires — underinflation is the leading cause of trailer blowouts.

## Common mistakes we see at the counter

- **Downgrading to save money.** A C-range tire on a D-range trailer is overloaded from day one.
- **Upgrading tire but not wheel.** A load range E tire at 80 psi needs a wheel rated for that pressure and load — verify the wheel stamp.
- **Ignoring age.** Trailer tires usually age out before they wear out; check the DOT date if the trailer sits.

Verify final fitment, capacity, and pressure against the trailer, wheel, and tire manufacturer specifications.

**Dealers and trailer plants:** heavy-duty load ranges through G are a Dallas-warehouse staple for us — [check live stock](/tires/st-trailer) or [get a wholesale quote](/quote).`,
  },
  {
    slug: "what-does-8pr-10pr-14pr-mean",
    title: "What Does 8PR, 10PR, and 14PR Mean on a Tire?",
    description:
      "PR means ply rating. What 6PR, 8PR, 10PR and 14PR actually tell you, how ply ratings map to load range letters, and which your trailer or truck needs.",
    answer:
      "PR stands for ply rating — a strength equivalence, not a literal count of fabric layers. 6PR corresponds to load range C, 8PR to D, 10PR to E, 12PR to F, and 14PR to G. A higher ply rating means the tire is built to carry more weight at a higher inflation pressure.",
    bodyMd: `## Ply rating is a strength grade, not a layer count

Decades ago tires really did have 8 or 10 cotton plies. Modern radials achieve the same strength with one or two steel/polyester belts, so "8PR" now means "as strong as an old 8-ply tire." That's why the industry also uses load range letters — same information, newer label:

| Ply rating | Load range | Typical max pressure |
| --- | --- | --- |
| 6PR | C | ~50 psi |
| 8PR | D | ~65 psi |
| 10PR | E | ~80 psi |
| 12PR | F | ~95 psi |
| 14PR | G | ~110 psi |

## Why Texas trailer buyers see PR so often

Import trailer tire catalogs — and most Chinese-manufactured lines — still label by PR. When a spec sheet says **ST235/80R16-14PR**, that's a load range G tire at ~110 psi: heavy gooseneck and equipment-trailer territory.

## Picking the right rating

- Match the trailer **certification plate** minimum — or go one step up if the trailer runs loaded at GVWR every day.
- Higher PR needs matching hardware: wheels rated for the pressure and [high-pressure valve stems](/knowledge/trailer-valve-stem-guide).
- Full capacity only exists at full rated pressure, checked cold.

Always verify against the tire's own sidewall marking and the manufacturer's load/inflation table.

**Stocking dealer?** We carry 6PR through 14PR trailer tires in the Dallas warehouse with [live stock status](/tires/st-trailer) — [tier pricing here](/become-a-dealer).`,
  },
  {
    slug: "how-to-read-commercial-truck-tire-sizes",
    title: "How to Read a Commercial Truck Tire Size (11R22.5, 295/75R22.5)",
    description:
      "Commercial truck tire sizes decoded: what 11R22.5 and 295/75R22.5 mean, how the two systems compare, and which positions each size serves.",
    answer:
      "Commercial truck tires use two sizing systems. Standard sizes like 11R22.5 read: 11 = nominal section width in inches, R = radial, 22.5 = rim diameter. Metric sizes like 295/75R22.5 read: 295 = width in millimeters, 75 = aspect ratio, 22.5 = rim diameter. 11R22.5 and 295/75R22.5 are close in overall size and are the two most common line-haul sizes in the US.",
    bodyMd: `## Two systems, one fleet

**Standard (inch) sizing — 11R22.5:**
- **11** — nominal section width in inches
- **R** — radial construction
- **22.5** — rim diameter in inches (tubeless low-platform)

**Metric sizing — 295/75R22.5:**
- **295** — section width in mm (~11.6")
- **75** — aspect ratio (sidewall = 75% of width)
- **22.5** — rim diameter in inches

## The big four in Texas trucking

| Size | Rough overall diameter | Where you'll see it |
| --- | --- | --- |
| 295/75R22.5 | ~40.5" | The dominant line-haul size — lower, slightly lighter |
| 11R22.5 | ~41.5" | The classic all-round size, regional and mixed fleets |
| 11R24.5 | ~43.6" | Owner-operators and fleets wanting max rubber |
| 285/75R24.5 | ~42.4" | Metric counterpart on 24.5 wheels |

Load ratings on commercial tires appear as load range letters (G = 14PR, H = 16PR are most common) plus a load index — verify the sidewall against your axle weights.

## Position matters as much as size

The same size comes in steer, drive, and trailer-position tread designs that are **not** interchangeable jobs — see our guide to [steer vs drive vs trailer tires](/knowledge/steer-drive-trailer-positions). Mixed fleets running regional Texas routes usually standardize on one size across positions to simplify spares — a topic we cover in [fleet tire buying for Dallas operations](/knowledge/dallas-fleet-tire-buying-guide).

**Fleet or commercial dealer?** [Commercial truck tires in stock in Dallas](/tires/commercial-truck) · [fleet programs](/fleet-solutions) · [wholesale quote](/quote).`,
  },
  {
    slug: "steer-drive-trailer-positions",
    title: "Steer vs Drive vs Trailer Tires: Why Position Matters on a Commercial Truck",
    description:
      "Steer, drive, and trailer-position commercial tires do different jobs. Tread designs, wear patterns, FMCSA tread-depth rules, and what happens if you mix them up.",
    answer:
      "Steer tires use straight ribs for tracking and even wear on the front axle; drive tires use deep lugs or siped blocks for traction on powered axles; trailer-position tires use shallow, fuel-efficient ribs built to resist scrub. FMCSA requires 4/32\" minimum tread on steers and 2/32\" elsewhere. Running a tire in the wrong position wears it out early and can compromise handling.",
    bodyMd: `## Three positions, three jobs

**Steer (front axle):** straight-rib tread for precise tracking, ribbed shoulders to fight irregular wear, and the most safety-critical position on the truck. FMCSA minimum: **4/32"** tread.

**Drive (powered axles):** open-shoulder or closed-shoulder lug tread for traction. Closed-shoulder drives run quieter and wear longer on highway; open-shoulder bites better in yard mud and gravel. Minimum: **2/32"**.

**Trailer position:** shallow rib tread optimized for low rolling resistance and side-scrub resistance in tandems. They're dragged, not driven — the tread is built to survive it. Minimum: **2/32"**.

## What mixing positions costs

- A drive tire on a steer axle wanders and cups.
- A steer-tread tire on a drive axle spins in the first wet dock apron.
- Trailer tires anywhere else are simply under-built for the job — the same reason [ST tires never go on trucks](/knowledge/st-trailer-tire-sizes-explained).

## Reading your wear

- **Steer shoulder wear** → alignment or pressure
- **Drive heel-toe wear** → normal in moderation; aggressive = check spec
- **Trailer flat-spotting** → dragged brakes or long sits

## A simple regional-fleet strategy

Many DFW regional fleets standardize on one size (usually 11R22.5 or 295/75R22.5, load range G) with a steer rib, closed-shoulder drive, and trailer rib — three SKUs, one spare pool. We stock all three positions in the Dallas warehouse: [browse commercial tires](/tires/commercial-truck) or [set up a fleet program](/fleet-solutions).`,
  },
  {
    slug: "trailer-wheel-bolt-pattern-guide",
    title: "Trailer Wheel Bolt Patterns: 5x4.5, 6x5.5, 8x6.5 and How to Order the Right Wheel",
    description:
      "The common trailer wheel bolt patterns, what 5x4.5 actually measures, and the four specs a dealer needs to order the right trailer wheel the first time.",
    answer:
      "A bolt pattern like 5x4.5 means 5 lug holes on a 4.5-inch bolt circle. The most common trailer patterns are 4x4 and 5x4.5 on light trailers, 6x5.5 on mid-size tandems, and 8x6.5 on heavy gooseneck and equipment trailers. To order a wheel you need four specs: diameter x width, bolt pattern, center bore, and load rating.",
    bodyMd: `## The patterns that cover most trailers

| Pattern | Bolt circle | Typical trailers |
| --- | --- | --- |
| 4x4 | 4" | Small utility, boat |
| 5x4.5 | 4.5" | The most common: utility, boat, small enclosed |
| 5x5 | 5" | Some utility and vintage builds |
| 6x5.5 | 5.5" | Tandem utility, car haulers, mid enclosed |
| 8x6.5 | 6.5" | Gooseneck, equipment, heavy enclosed |

(Metric equivalents appear in import catalogs: 5x4.5 = 5x114.3 mm, 6x5.5 = 6x139.7 mm, 8x6.5 = 8x165.1 mm.)

## Measuring without guessing

- **Even lug counts (4, 6, 8):** measure center-to-center across directly opposite holes. Done.
- **5-lug:** measure from the center of one hole to the **outer edge** of the hole two positions away — or skip the tape and use our [bolt pattern guide tool](/tools/bolt-pattern-guide).

## The four specs on every wheel order

1. **Size** — diameter × width (15x5, 15x6, 16x6…)
2. **Bolt pattern** — count × circle
3. **Center bore** — must clear the hub pilot
4. **Load rating** — stamped on the wheel; must meet the tire's capacity at its inflation pressure

A load range E tire at 80 psi on a wheel rated for 65 psi is a hidden failure point — always match the stamp. Verify final fitment against the trailer and wheel manufacturer specifications.

**Shops and trailer plants:** we stock steel and galvanized trailer wheels plus [mounted assemblies](/packages) in every pattern above — [Dallas live stock](/wheels) · [wholesale quote](/quote).`,
  },
  {
    slug: "steel-vs-aluminum-trailer-wheels",
    title: "Steel vs Aluminum Trailer Wheels: A Buyer's Guide for Dealers and Trailer Builders",
    description:
      "Steel, galvanized, and aluminum trailer wheels compared on price, corrosion, weight, and resale appeal — and which spec wins for each trailer type.",
    answer:
      "Steel trailer wheels cost the least and take impacts well; galvanized steel adds strong corrosion protection for boat and coastal use; aluminum weighs less, runs cooler, never rusts, and upgrades a trailer's look and resale value at roughly two to three times the price of painted steel. Most utility trailers ship on painted steel, boat trailers on galvanized, and premium enclosed or marine builds on aluminum.",
    bodyMd: `## The three-way comparison

| Factor | Painted steel | Galvanized steel | Aluminum |
| --- | --- | --- | --- |
| Price | $ | $$ | $$$ |
| Corrosion | Fair (chips rust) | Excellent | Excellent (no red rust) |
| Weight | Heaviest | Heaviest | ~30–40% lighter |
| Impact durability | Excellent | Excellent | Good |
| Appearance/resale | Basic | Utility | Premium |

## Match the wheel to the build

- **Utility & landscape trailers** — painted steel (spoke or mod). Cheapest to build, easy to replace.
- **Boat trailers** — galvanized is the default; dunking painted steel in a Texas lake starts the rust clock immediately.
- **Enclosed cargo & car haulers** — aluminum sells the trailer on the lot. Buyers read aluminum wheels as a premium build.
- **Heavy equipment** — steel dual-capable wheels with the load stamp to match.

## What matters more than material

Whatever the material, the wheel must carry the **load rating** and **inflation pressure** of the tire mounted on it — check the stamp, especially when upgrading tires to load range E or higher. Bolt pattern and center bore rules are in our [bolt pattern guide](/knowledge/trailer-wheel-bolt-pattern-guide).

## Buy them mounted

For production lines and busy shops, [pre-mounted, ready-to-bolt-on assemblies](/packages) remove a whole station of labor — tire, wheel, valve stem, mounted and inflated. It's one of the most popular things we supply out of Dallas. [Wholesale pricing here](/quote).`,
  },
  {
    slug: "trailer-manufacturer-tire-supply-playbook",
    title: "How Trailer Manufacturers Can Cut Tire Supply Delays",
    description:
      "A practical supply playbook for trailer plants: consolidate SKUs, buy mounted assemblies, hold the right buffer, and structure a local backup supplier in DFW.",
    answer:
      "Trailer manufacturers cut tire-related line stoppages by standardizing on fewer tire-and-wheel SKUs, buying pre-mounted assemblies instead of mounting in-house, holding a two-to-three week buffer of their top movers, and keeping a local distributor relationship for same-week gap fills between container arrivals.",
    bodyMd: `## Where the delays actually come from

Plants rarely stop because tires don't exist — they stop because the *right* tire isn't in the building on build day: a container slipped two weeks, one spec of ten ran dry, or mounting capacity became the bottleneck. The fixes are structural:

## 1. Consolidate SKUs ruthlessly

Every extra size/load-range/wheel combination multiplies your stockout risk. Most product lines can standardize around a handful of combinations (ST205/75R15-D and ST225/75R15-D on 5x4.5, ST235/80R16-E/G on 6x5.5 or 8x6.5 cover a remarkable share of builds). Fewer SKUs = deeper buffers at the same inventory dollars.

## 2. Buy mounted assemblies

Mounting, balancing, and airing in-house consumes floor space, labor, and a machine that breaks. [Pre-mounted assemblies](/packages) arrive line-ready — the per-unit premium is usually smaller than the internal cost it replaces, and it converts a variable process into a purchased part.

## 3. Size the buffer to your real lead times

If your primary supply is import containers, your true replenishment time is weeks. A 2–3 week buffer of top movers — held by you or reserved with a local distributor — covers a slipped vessel without air-freight heroics.

## 4. Keep a local gap-fill relationship

This is exactly the role we play for trailer builders across Dallas–Fort Worth: warehouse stock of the standard trailer sizes and wheels, same-week local delivery or dock pickup, and recurring pallet programs between your container arrivals. See [our service area](/service-area) and [factory supply pricing](/quote).

## 5. Watch DOT dates on slow movers

Tires age in your rack the same as on a trailer. Rotate slow SKUs into builds before storing new arrivals — first in, first out.`,
  },
  {
    slug: "tire-dealer-inventory-turnover",
    title: "How Tire Dealers Can Improve Inventory Turnover Without Losing Sales",
    description:
      "Practical turnover math for independent tire dealers: rank SKUs by velocity, cut dead stock, lean on distributor stock for the tail, and reorder on cadence.",
    answer:
      "Independent tire dealers improve turnover by stocking deep on the top-velocity sizes, letting a local distributor's warehouse carry the slow tail instead of their own racks, moving aged and orphan inventory out at cost, and reordering weekly on sell-through rather than gut feel.",
    bodyMd: `## Turnover is the whole game

A tire on your rack for a year ties up cash, floor space, and DOT-date freshness. Healthy independent shops turn inventory several times a year; the difference between 2 turns and 6 is mostly discipline, not luck.

## Rank every SKU by velocity

Pull 90 days of sales and sort. Almost every shop finds:

- A **short head** (10–20 sizes) doing most of the volume — stock these deep, never run out.
- A **long tail** sold once or twice — this is what kills turnover when it sits on your racks.

## Let the warehouse be your tail

You don't need to own the tail — you need **access** to it. With a distributor 30 minutes away holding 1,000+ SKUs, a same-week fill order beats months of shelf-sitting. That's the model we run from Dallas for shops across DFW: [live warehouse stock](/tires), dock pickup or local delivery, [dealer tier pricing](/become-a-dealer).

## Move dead stock on purpose

Anything past 12 months: promo it, package it with wheels, or wholesale it out — at cost if needed. The cash and the rack space are worth more than the margin you're "waiting" for, and the DOT date only gets older.

## Reorder on cadence, not on panic

A fixed weekly review of sell-through vs stock beats emergency orders every time. Our dealers paste a size list into the [quick order form](/dealer/quick-order) and get a tier-priced quote back the same day.

## Watch the mix shift

Trailer-tire demand in Texas spikes ahead of spring hauling and hurricane season; commercial positions run steadier. Two or three seasonal buys on the trailer side usually out-earn twelve identical monthly orders.`,
  },
  {
    slug: "dallas-fleet-tire-buying-guide",
    title: "What Dallas–Fort Worth Fleets Should Consider When Buying Commercial Tires",
    description:
      "A buying framework for DFW fleets: Texas heat and load realities, cost per mile over unit price, size consolidation, and supplier response time.",
    answer:
      "DFW fleets should buy commercial tires on cost per mile rather than unit price, spec for sustained Texas heat with correct load-range and pressure discipline, consolidate sizes across the fleet to shrink the spare pool, and choose a supplier by response time — because a down truck costs more per day than any per-tire saving.",
    bodyMd: `## 1. Buy cost per mile, not price per tire

A tire that costs 20% more and lasts 40% longer is the cheap one. Track take-off mileage by SKU and position for a quarter and the winners become obvious — our [cost-per-mile calculator](/tools/cost-per-mile-calculator) does the arithmetic and annualizes it across the fleet.

## 2. Respect Texas heat

Sustained 100°F+ pavement is the hardest normal duty a tire sees. Heat magnifies every other mistake:

- **Pressure discipline** matters more here than anywhere — underinflation plus heat is the blowout recipe.
- Verify **load range vs actual axle weights**, not the weights on the spec sheet from three trailers ago.
- Regional stop-start duty builds more heat than line-haul cruising — tread choice should match the route profile.

## 3. Consolidate sizes

Every additional size in the fleet is another spare pool, another storage bin, another chance the right tire isn't on the shelf. Most mixed DFW fleets can converge on one or two sizes (11R22.5 / 295/75R22.5) across three position treads — see [steer vs drive vs trailer](/knowledge/steer-drive-trailer-positions).

## 4. Grade suppliers on response time

The real test isn't the quote — it's Tuesday 2pm with a unit down in Mesquite. Local warehouse stock, dock pickup, and a rep who answers are worth real money. That's the service model we run for fleets from our Dallas warehouse: [fleet programs](/fleet-solutions) · [commercial stock](/tires/commercial-truck).

## 5. Put the program in writing

Standardized SKUs, agreed pricing tiers, a monthly usage figure, and a reorder cadence — one page. It turns tire buying from firefighting into procurement.`,
  },
  {
    slug: "trailer-valve-stem-guide",
    title: "How to Select a Valve Stem for High-Pressure Trailer Tires",
    description:
      "Standard snap-in valve stems are rated to about 65 psi. What to fit on load range E, F, and G trailer tires running 80–110 psi, and why it matters.",
    answer:
      "Standard rubber snap-in valve stems (TR413/TR415 type) are rated to roughly 65 psi — adequate for load range C and D trailer tires. Load range E, F, and G tires running 80–110 psi need high-pressure snap-in stems or, better, bolt-in metal stems rated for the tire's full inflation pressure. The valve stem must match the tire's pressure just like the wheel must match its load.",
    bodyMd: `## The overlooked failure point

A load range G tire at 110 psi mounted with a standard snap-in stem is a spec violation hiding in plain sight. Rubber snap-ins flex, age in Texas heat, and are simply not rated for high pressure — slow leaks and stem blowouts follow.

## Match the stem to the pressure

| Tire spec | Typical cold pressure | Correct stem |
| --- | --- | --- |
| Load range C / D (6–8PR) | 50–65 psi | Standard snap-in (TR413/TR415 class) |
| Load range E (10PR) | ~80 psi | High-pressure snap-in or bolt-in metal |
| Load range F / G (12–14PR) | 95–110 psi | **Bolt-in metal stem** |

Bolt-in stems seal with a grommet and nut through the valve hole — no rubber body to fatigue. On anything that tows heavy or sits long (both trailer specialties), they're cheap insurance.

## Three shop rules

1. **New tire, new stem** — always, whatever the pressure class.
2. **Metal caps with seals** on high-pressure stems; the cap is the secondary seal.
3. **Check the wheel's valve hole size** — standard holes take both types, but verify before ordering hardware for a production run.

As with tires and wheels, verify ratings against the component manufacturer's specifications.

## For shops and trailer builders

Our [mounted tire-and-wheel assemblies](/packages) ship with pressure-appropriate stems installed — one less thing on your line. Valve stems and shop supplies are joining the Dallas catalog; [ask for a quote](/quote) on bulk hardware.`,
  },
];

const db = new PrismaClient();
(async () => {
  for (const a of ARTICLES) {
    await db.article.upsert({
      where: { slug: a.slug },
      update: { title: a.title, description: a.description, answer: a.answer, bodyMd: a.bodyMd, author: AUTHOR },
      create: { ...a, brandKey: "EVERFLOW", author: AUTHOR, published: true, publishedAt: new Date() },
    });
    console.log("upserted:", a.slug);
  }
  const count = await db.article.count({ where: { brandKey: "EVERFLOW", published: true } });
  console.log("EVERFLOW published articles:", count);
  await db.$disconnect();
})();
