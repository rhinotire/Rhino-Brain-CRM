/**
 * Draft one Knowledge Center article per website tool (SEO content cluster:
 * article ⇄ tool cross-links). All drafts land UNPUBLISHED — the owner
 * reviews and publishes in CRM → Knowledge Center. Idempotent: existing
 * slugs are skipped, never overwritten.
 *
 *   pnpm exec tsx scripts/seed-tool-articles.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type Draft = { slug: string; title: string; description: string; answer: string; bodyMd: string };

const ARTICLES: Draft[] = [
  {
    slug: "can-i-change-tire-size-3-percent-rule",
    title: "Can I Change My Tire Size? The ±3% Rule Explained",
    description:
      "How far you can safely go up or down in tire size: the ±3% diameter rule, what it does to your speedometer, and when bigger tires cause real problems.",
    answer:
      "You can generally run a different tire size as long as the new overall diameter stays within about ±3% of the original. Beyond that, your speedometer and odometer read noticeably wrong, gearing changes, and clearance problems start — especially under load on trailers.",
    bodyMd: `## Where the 3% rule comes from

Everything downstream of your tires assumes a certain rolling distance per revolution: the speedometer, the odometer, the transmission's shift points, ABS, and on trailers, the load math. Change the overall diameter a little and everything stays within tolerance. Change it a lot and every one of those systems is now working with wrong numbers.

The industry rule of thumb: **stay within ±3% of your original overall diameter.**

## What happens as diameter changes

| Change | Speedometer | Ground clearance | Gearing feel |
|---|---|---|---|
| +1–3% | reads slightly slow | +0.15–0.5" | barely noticeable |
| +3–7% | 2–5 mph off at highway speed | +0.5–1" | noticeably taller / slower acceleration |
| +7%+ | badly wrong | rubbing risk | needs a re-gear |

A larger tire makes the speedometer read **low** — you're going faster than shown. That's a ticket generator.

## Check any two sizes in seconds

Our [tire size calculator](/tools/tire-size-calculator) compares any two sizes — metric or off-road formats — and shows the diameter difference, a to-scale drawing, and a full speedometer error table. If the difference shows red, look for a closer equivalent with the [metric ↔ inch converter](/tools/tire-size-converter).

## Trailer owners: one extra rule

On trailers, a bigger tire also needs to clear the fender **under full load and on bumps**, not just sitting still. Keep trailer substitutions tighter than ±3% and always match or exceed the original load range — see [what load range your trailer needs](/tools/trailer-load-calculator).`,
  },
  {
    slug: "why-trailer-tires-blow-out",
    title: "Why Trailer Tires Blow Out on the Highway (And How to Spec Against It)",
    description:
      "Most trailer tire blowouts trace back to heat: underinflation, overloading, or age. Here's the 20% capacity reserve professionals spec — and how to check yours.",
    answer:
      "Trailer tires usually fail from heat, not punctures. Underinflation, running at 100% of rated load, and rubber age all build heat until the casing lets go — typically at highway speed in summer. Speccing tires with about 20% reserve capacity and checking cold pressure before every trip prevents most blowouts.",
    bodyMd: `## Heat is the killer

A trailer tire almost never "just blows." It overheats. Three things build that heat:

| Cause | Why it builds heat | The fix |
|---|---|---|
| Underinflation | sidewall flexes more per revolution | check cold PSI before every trip |
| No capacity reserve | tire runs at 100% of rated load | spec ~20% headroom |
| Age | old rubber flexes poorly, cracks internally | replace ST tires around 5–6 years |

## The 20% reserve rule

Add up your tires' rated capacity and compare it to your trailer's real loaded weight. If the load uses more than about 80% of total capacity, you have no thermal headroom — and summer highway miles will find that out.

Run your numbers in the [trailer tire load calculator](/tools/trailer-load-calculator): GVWR, axles, hitch type in — the per-tire capacity and load index you need out, reserve included.

## Pressure: the daily discipline

ST tires carry their rated load **only at the maximum pressure molded on the sidewall**. And pressure follows temperature — air set in a warm garage reads several PSI lower on a cold morning ([see exactly how much](/tools/temperature-pressure-calculator)). Check cold, before driving.

## Age: the invisible failure

Trailer tires age out before they wear out — sun and sitting do more damage than miles. Decode your manufacture date with the [DOT date decoder](/tools/dot-date-decoder); most trailer tire guidance says replace around 5–6 years regardless of tread.`,
  },
  {
    slug: "how-to-measure-bolt-pattern",
    title: "How to Measure a Trailer Wheel Bolt Pattern (5x4.5 Explained)",
    description:
      "What 5x4.5 means, how to measure even and 5-lug bolt patterns correctly, and the standard trailer patterns in inches and millimeters.",
    answer:
      "A bolt pattern like 5x4.5 means five lug holes on a 4.5-inch circle. Even lug counts measure center-to-center straight across; 5-lug wheels measure from one hole's center to the far edge of the hole two positions over — or use the exact neighbor-spacing method.",
    bodyMd: `## Reading the number

**5x4.5** (also written 5 on 4½ or 5x114.3 mm): the first number is the lug count, the second is the diameter of the circle the holes sit on.

## Measuring it right

- **4, 6 or 8 lugs:** measure from the **center** of one hole to the **center** of the hole directly across. Done.
- **5 lugs:** there's no hole directly across. Shop method: center of one hole → **far edge** of the hole two positions over. Exact method: measure two **neighboring** holes center-to-center and multiply by 1.7013.

The [bolt pattern guide](/tools/bolt-pattern-guide) has diagrams for both and a calculator that names the standard pattern from your neighbor measurement.

## Common trailer patterns

| Pattern | Metric | Typically on |
|---|---|---|
| 4x4" | 4x101.6 | small boat/utility trailers |
| 5x4.5" | 5x114.3 | the most common trailer pattern |
| 5x5" | 5x127 | some trailers, classic GM |
| 6x5.5" | 6x139.7 | tandem-axle trailers |
| 8x6.5" | 8x165.1 | heavy tandem/triple axle |

## The other fitment number

Bolt pattern gets the wheel **on** the hub; offset/backspacing decides where it sits. If you're swapping wheel styles, check both — here's the [offset ↔ backspacing calculator](/tools/offset-backspacing-calculator) with a live diagram. Then [browse trailer wheels](/wheels) by size and pattern.`,
  },
  {
    slug: "33-inch-tires-metric-equivalent",
    title: "33-Inch Tires in Metric: The Real Equivalents",
    description:
      "What a 33X12.50R20 is in metric sizing, why 285/75R16 gets called a 33, and how to convert between inch and metric tire sizes correctly.",
    answer:
      "A \"33-inch tire\" is any tire with roughly a 33-inch overall diameter. On a 20-inch rim, the metric equivalents of 33X12.50R20 are 325/50R20 and 305/55R20; on a 16-inch rim, the classic \"metric 33\" is 285/75R16. The right equivalent depends on your rim size.",
    bodyMd: `## Two languages, one tire

Off-road (flotation) sizes read in inches: **33X12.50R20** = 33" tall, 12.5" wide, 20" rim. Metric sizes encode the same tire differently: width in millimeters, sidewall as a percentage. Neither is more correct — but crossing between them trips everyone up.

## The classic crossovers

| Inch size | Rim | Closest metric |
|---|---|---|
| 33X12.50R20 | 20" | 325/50R20 · 305/55R20 |
| 33X11.50R16 (≈) | 16" | 285/75R16 (the classic "33") |
| 35X12.50R20 | 20" | 325/60R20 |
| 37X13.50R24 | 24" | — usually inch-only territory |

"Closest" never means identical — the two systems use different step sizes, so expect a fraction of an inch difference in diameter or width.

## Convert yours

The [metric ↔ inch converter](/tools/tire-size-converter) takes any size and ranks the standard equivalents **on your rim** by how close the diameter lands. Then sanity-check the swap against the ±3% rule in the [size comparison calculator](/tools/tire-size-calculator) — and if you went bigger, see [whether you need a re-gear](/tools/gear-ratio-calculator).`,
  },
  {
    slug: "tire-cost-per-mile",
    title: "The Cheapest Tire Is Rarely the Lowest Cost: Buying by Cost per Mile",
    description:
      "Fleets don't buy tires on sticker price — they buy on cost per mile. The math, a worked example, and a calculator to run your own numbers.",
    answer:
      "Divide a tire's price by the miles it actually delivers and the picture flips: a $165 tire that runs 55,000 miles costs $3.00 per 1,000 miles, while a $120 tire that runs 30,000 costs $4.00. The \"cheaper\" tire is 33% more expensive to operate.",
    bodyMd: `## The only number that hits the P&L

Sticker price is paid once. Miles are what you sell. Cost per mile = price ÷ tread life, and it's how every serious fleet buys rubber.

## A worked example

| | Tire A | Tire B |
|---|---|---|
| Price | $120 | $165 |
| Tread life | 30,000 mi | 55,000 mi |
| **Cost / 1,000 mi** | **$4.00** | **$3.00** |

Tire B costs $45 more at the counter and 25% less every mile after that. Across 18 tire positions running 100,000 miles a year, that difference is about **$1,800 per year** — from one line-item decision.

Run your own numbers in the [cost per mile calculator](/tools/cost-per-mile-calculator) — it includes the fleet annualization and a fuel cost-per-mile check.

## Where tread life numbers come from

Your own scrap records beat everything: miles-at-removal is the gold standard. No records yet? Start from the manufacturer's mileage warranty and your dealer's experience with the line, then refine.

## Don't forget the fuel side

Underinflated and worn-out tires raise rolling resistance, and fuel dwarfs tire spend on most trucks. Tire pressure discipline is fuel money — [see how temperature moves your PSI](/tools/temperature-pressure-calculator). Ready to price a program? [Request fleet pricing](/quote).`,
  },
  {
    slug: "how-old-are-my-tires-dot-date",
    title: "How Old Are My Tires? Reading the DOT Date Code",
    description:
      "Every tire's manufacture date is molded into the sidewall. How to read the DOT date code, what age is too old, and why trailer tires age out fastest.",
    answer:
      "The last four digits of your tire's DOT code are the week and year it was made — 3523 means week 35 of 2023. Industry guidance: annual professional inspections from age 5, most manufacturers recommend replacement between 6 and 10 years, and 10 years is the ceiling regardless of tread.",
    bodyMd: `## Finding the code

On the sidewall, look for letters starting with **DOT**, followed by plant and size codes. The date is the final 4-digit group — on some tires it's only molded on one side.

**Example:** DOT U2LL LMLR **3523** → week 35 of 2023.

Type yours into the [DOT date decoder](/tools/dot-date-decoder) for the exact date, the tire's age today, and what to do about it.

## Age guidance the industry actually uses

| Age | Status |
|---|---|
| under 5 years | normal service — watch tread and pressure |
| 5–6 years | professional inspection every year; trailer tires: plan replacement |
| 6–10 years | many manufacturers recommend replacement regardless of tread |
| over 10 years | replace, period |

A 3-digit date code means the tire predates 2000 — replace it immediately.

## Why age matters even with good tread

Rubber degrades from the inside out: oxidation stiffens the casing whether or not the tire turns a mile. Sun, heat and sitting accelerate it — which is exactly a trailer tire's life. That's why trailer guidance says 5–6 years even when the tread looks new.

Tread has its own clock too — check both: [tread depth guide](/tools/tread-depth-guide). Time for a set? [Find installation near you](/find-installation).`,
  },
  {
    slug: "regear-after-bigger-tires",
    title: "Do I Need to Re-Gear After 35s? The Math Behind the Sluggish Feeling",
    description:
      "Bigger tires effectively raise your gearing — that's why the truck feels slow after 35s. The effective-ratio math, and how to pick the re-gear that restores stock feel.",
    answer:
      "Bigger tires turn fewer times per mile, which effectively raises your gearing: 3.73 gears with 35s on a truck built for 31s behave like about 3.30. To restore stock performance, multiply your ratio by the new diameter over the old — 3.73 × 35/31 ≈ 4.21, so most people re-gear to 4.10 or 4.30.",
    bodyMd: `## Why the truck feels lazy

Torque at the wheels depends on gearing **and** tire radius. Grow the tire and every gear gets effectively taller: less acceleration, lazier towing, a transmission hunting for the right gear on grades, and a speedometer that reads low.

## The effective-ratio math

**Effective ratio = axle ratio × (old diameter ÷ new diameter)**

| Setup | Effective gearing feels like |
|---|---|
| 3.73 + stock 31.6" | 3.73 (baseline) |
| 3.73 + 35s | ≈ 3.37 |
| 4.10 + 35s | ≈ 3.70 — back to stock |
| 4.30 + 35s | ≈ 3.88 — stock-plus (towing bias) |

**Needed ratio = axle ratio × (new ÷ old).** From 31.6" to 35" on 3.73: 3.73 × 35/31.6 ≈ 4.13 → shop for 4.10 (highway bias) or 4.30–4.56 (towing/off-road bias).

The [gear ratio & RPM calculator](/tools/gear-ratio-calculator) does this for your exact sizes and shows cruise RPM at 55–75 mph before and after.

## While you're planning the swap

Confirm the size jump itself is sane with the [size comparison calculator](/tools/tire-size-calculator) (speedometer error table included), and find your metric/inch equivalents in the [converter](/tools/tire-size-converter). Then [browse light truck tires](/tires/light-truck) — 33s, 35s and 37s at wholesale.`,
  },
  {
    slug: "wheel-offset-vs-backspacing",
    title: "Wheel Offset vs. Backspacing: One Number, Two Languages",
    description:
      "Offset (mm) and backspacing (inches) describe the same thing — where the hub face sits in the wheel. How to convert between them and what changes when you move it.",
    answer:
      "Offset measures the hub face's distance from the wheel's centerline in millimeters; backspacing measures it from the back flange in inches. Convert with: backspacing = (width + 1) ÷ 2 + offset ÷ 25.4. Most trailer wheels run zero offset.",
    bodyMd: `## Two conventions, one measurement

Where the mounting face sits inside the wheel decides whether the wheel tucks in or pokes out.

- **Offset (mm):** distance from the wheel centerline. Positive = toward the street side (tucks in). Negative = toward the brakes (pokes out, deep dish). Passenger and import catalogs speak offset.
- **Backspacing (inches):** distance from the back flange to the face. Trailer and off-road catalogs speak backspacing.

## The conversion

**Backspacing = (wheel width + 1) ÷ 2 + offset ÷ 25.4** — the +1" covers the flanges.

| 8" wide wheel | Offset | Backspacing |
|---|---|---|
| deep dish | −25 mm | 3.52" |
| centered | 0 mm | 4.50" |
| modern truck | +18 mm | 5.21" |

Or skip the math: the [offset ↔ backspacing calculator](/tools/offset-backspacing-calculator) converts both directions with a live cross-section diagram that moves as you type.

## Rules that keep you out of trouble

Trailer wheels are almost always **zero offset** — load centered over the bearings. On vehicles, staying within about **±5 mm of stock** avoids steering and bearing surprises; going more negative widens the stance but loads bearings and can rub. Always check brake-caliper clearance on the backspacing side.

Pattern next: measure it right with the [bolt pattern guide](/tools/bolt-pattern-guide), then [browse wheels](/wheels).`,
  },
  {
    slug: "penny-test-tread-depth",
    title: "The Penny Test Is a Floor, Not a Goal: When to Really Replace Tires",
    description:
      "2/32\" is the legal minimum, but wet braking falls apart before that. The penny and quarter tests, FMCSA commercial minimums, and when to actually replace.",
    answer:
      "The penny test flags the 2/32-inch legal minimum — but wet braking and hydroplaning resistance degrade dramatically below 4/32, which is where the quarter test comes in. Treat 2/32 as the law's floor and 4/32 as your shopping trigger.",
    bodyMd: `## Two coins, two thresholds

- **Penny test (2/32"):** Lincoln's head upside down in the groove. See the top of his head → the tire is legally worn out.
- **Quarter test (4/32"):** same move with Washington. See his head → wet-weather margin is thin; start shopping.

Test multiple grooves across the tire — uneven wear hides in the shoulders. Or measure once with a $2 depth gauge and use the [tread depth guide](/tools/tread-depth-guide) to see exactly how much usable tread you have left.

## Why 4/32 is the real line

Independent wet-braking tests show stopping distances growing dramatically in the last few 32nds — grooves that can't evacuate water plane on top of it. Legal ≠ safe in rain.

## The reference numbers

| Depth | Meaning |
|---|---|
| 10–12/32" | typical new highway tire (AT/MT: 13–17) |
| 6/32"+ | healthy |
| 4/32" | wet performance falling off — FMCSA steer-tire minimum |
| 2/32" | legal floor — wear bars flush |

## Tread isn't the only clock

Trailer tires usually **age out before they wear out** — check the [DOT date code](/tools/dot-date-decoder) too. Worn out? [Find installation near you](/find-installation) or [browse tires](/tires).`,
  },
  {
    slug: "tire-pressure-cold-weather",
    title: "Why Your TPMS Light Comes On the First Cold Morning",
    description:
      "Tire pressure drops about 2% for every 10°F — nothing is leaking. The gas-law math, what it means for trailer tires, and how to set pressure by season.",
    answer:
      "Air contracts when it cools: tire pressure drops roughly 2% for every 10°F fall — about 1 PSI on a passenger tire, but 1.3–1.5 PSI on a 65-psi trailer tire. Pressure set in warm weather reads genuinely low on the first cold morning, so top up at the colder temperature.",
    bodyMd: `## Nothing is leaking — it's physics

Pressure tracks absolute temperature (the gas law). Set 65 PSI in a 75°F garage and a 30°F morning reads about **59.5 PSI** — an 8% shortfall, no puncture required.

| Set at 75°F | Reads at 50°F | at 30°F | at 10°F |
|---|---|---|---|
| 35 PSI | 33.4 | 32.1 | 30.8 |
| 65 PSI | 62.0 | 59.5 | 57.1 |
| 100 PSI | 95.3 | 91.6 | 87.8 |

Run your own numbers in the [temperature & pressure calculator](/tools/temperature-pressure-calculator).

## Why this matters most on trailers

An ST tire's load rating only exists **at the maximum sidewall pressure** — a fall temperature drop quietly converts a correctly-aired trailer into an underinflated one. Underinflation builds heat, and heat is the number-one trailer tire killer. The classic "mystery blowout" on the season's first cold-weather tow starts right here.

## The habit that prevents it

Check pressures **cold** — before driving, or after 3+ hours parked — monthly and before every trip. When the season turns, re-set to the placard or sidewall number at the new temperature, don't just glance at the TPMS.

Older tires lose pressure-holding ability too — [check your date codes](/tools/dot-date-decoder) while you're at the valve stems.`,
  },
];

async function main() {
  let created = 0;
  let skipped = 0;
  for (const a of ARTICLES) {
    const existing = await db.article.findUnique({ where: { slug: a.slug }, select: { id: true } });
    if (existing) { skipped++; continue; }
    await db.article.create({ data: { ...a, brandKey: "RHINO", published: false } });
    created++;
    console.log(`draft created: ${a.slug}`);
  }
  console.log(`\ndone — ${created} drafts created, ${skipped} already existed (untouched)`);
}

main().finally(() => db.$disconnect());
