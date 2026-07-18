/**
 * Common FACTORY staggered fitments on popular US-market vehicles.
 * These are public OEM fitment facts (approximate year ranges; trim
 * variations exist) — NOT sales statistics. The "most common sizes"
 * ranking below is derived transparently from this table.
 */

export type StaggeredFitment = { vehicle: string; years: string; front: string; rear: string };

export const STAGGERED_FITMENTS: StaggeredFitment[] = [
  { vehicle: "Ford Mustang GT (Performance Pack)", years: "2015–23", front: "255/40R19", rear: "275/40R19" },
  { vehicle: "Ford Mustang Shelby GT500", years: "2020–22", front: "305/30R20", rear: "315/30R20" },
  { vehicle: "Chevrolet Camaro SS (20\")", years: "2016–24", front: "245/40R20", rear: "275/35R20" },
  { vehicle: "Chevrolet Corvette C6", years: "2005–13", front: "245/40R18", rear: "285/35R19" },
  { vehicle: "Chevrolet Corvette C7 Stingray", years: "2014–19", front: "245/35R19", rear: "285/30R20" },
  { vehicle: "Chevrolet Corvette C8 Stingray", years: "2020–", front: "245/35R19", rear: "305/30R20" },
  { vehicle: "BMW 3 Series M Sport (18\")", years: "F30 2012–18", front: "225/45R18", rear: "255/40R18" },
  { vehicle: "BMW 3/4 Series M Sport (19\")", years: "2012–20", front: "225/40R19", rear: "255/35R19" },
  { vehicle: "BMW 5 Series M Sport (19\")", years: "G30 2017–", front: "245/40R19", rear: "275/35R19" },
  { vehicle: "BMW M3 / M4", years: "F80/F82 2014–19", front: "255/35R19", rear: "275/35R19" },
  { vehicle: "BMW M4 (19/20\" mixed)", years: "G82 2021–", front: "275/35R19", rear: "285/30R20" },
  { vehicle: "BMW Z4", years: "G29 2019–", front: "255/35R19", rear: "275/35R19" },
  { vehicle: "BMW X5 / X6 M Sport (21\")", years: "G05 2019–", front: "275/40R21", rear: "315/35R21" },
  { vehicle: "Mercedes C-Class AMG Line (18\")", years: "W205 2015–21", front: "225/45R18", rear: "245/40R18" },
  { vehicle: "Mercedes-AMG C63", years: "W205 2015–21", front: "245/35R19", rear: "265/35R19" },
  { vehicle: "Mercedes E-Class AMG Line (19\")", years: "W213 2017–23", front: "245/40R19", rear: "275/35R19" },
  { vehicle: "Toyota GR Supra", years: "A90 2020–", front: "255/35R19", rear: "275/35R19" },
  { vehicle: "Nissan 370Z Sport", years: "2009–20", front: "245/40R19", rear: "275/35R19" },
  { vehicle: "Nissan Z Performance", years: "2023–", front: "255/40R19", rear: "275/35R19" },
  { vehicle: "Infiniti G37 / Q60 Sport", years: "2008–15", front: "225/45R19", rear: "245/40R19" },
  { vehicle: "Lexus IS F Sport (RWD)", years: "2014–20", front: "225/40R18", rear: "255/35R18" },
  { vehicle: "Lexus RC F", years: "2015–", front: "255/35R19", rear: "275/35R19" },
  { vehicle: "Genesis Coupe 3.8 / R-Spec", years: "2010–16", front: "225/40R19", rear: "245/40R19" },
  { vehicle: "Genesis G70 Sport (RWD)", years: "2019–", front: "225/40R19", rear: "255/35R19" },
  { vehicle: "Tesla Model S (21\")", years: "2012–20", front: "245/35R21", rear: "265/35R21" },
  { vehicle: "Tesla Model Y Performance (21\")", years: "2020–", front: "255/40R21", rear: "275/35R21" },
  { vehicle: "Porsche 718 Cayman / Boxster (18\")", years: "2017–", front: "235/45R18", rear: "265/45R18" },
  { vehicle: "Porsche 911 Carrera S", years: "991.2 2017–19", front: "245/35R20", rear: "305/30R20" },
  { vehicle: "Jaguar F-Type R (20\")", years: "2014–20", front: "255/35R20", rear: "295/30R20" },
  { vehicle: "Dodge Viper", years: "2013–17", front: "295/30R18", rear: "355/30R19" },
];

/** Sizes ranked by how many staggered fitments in the table use them. */
export function rankStaggeredSizes(): { size: string; count: number; axle: string }[] {
  const freq = new Map<string, { count: number; front: number; rear: number }>();
  for (const f of STAGGERED_FITMENTS) {
    for (const [axle, size] of [["front", f.front], ["rear", f.rear]] as const) {
      const e = freq.get(size) ?? { count: 0, front: 0, rear: 0 };
      e.count++;
      e[axle]++;
      freq.set(size, e);
    }
  }
  return [...freq.entries()]
    .map(([size, e]) => ({
      size,
      count: e.count,
      axle: e.front && e.rear ? "front + rear" : e.front ? "front" : "rear",
    }))
    .sort((a, b) => b.count - a.count || a.size.localeCompare(b.size));
}
