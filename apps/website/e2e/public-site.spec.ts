import { test, expect } from "@playwright/test";

test("homepage server-renders full content (SEO non-negotiable)", async ({ request }) => {
  // raw HTML, no JS execution — what crawlers and AI engines see
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("Wholesale Tires, Wheels");
  expect(html).toContain('"@type":"Organization"');
  expect(html).toContain('"@type":"WebSite"');
});

test("no dealer pricing anywhere in public HTML", async ({ request }) => {
  for (const path of ["/", "/tires", "/wheels", "/parts", "/quote"]) {
    const html = await (await request.get(path)).text();
    for (const bad of ['"cost"', '"priceA"', '"priceB"', '"priceC"', '"priceD"']) {
      expect(html, `${path} must not contain ${bad}`).not.toContain(bad);
    }
  }
});

test("homepage has no horizontal overflow and shows key CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Get Wholesale Quote" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("quote page renders the form with honeypot", async ({ page }) => {
  await page.goto("/quote");
  await expect(page.locator('input[name="companyName"]')).toBeVisible();
  await expect(page.locator('input[name="website"]')).toBeHidden(); // honeypot stays invisible
});

test("robots.txt blocks /dealer and sitemap.xml exists", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /dealer/");
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
});

test("find-installation: IDEAL routing inside radius, no overflow", async ({ page }) => {
  await page.goto("/find-installation?zip=32836");
  await expect(page.getByText("IDEAL TIRES & WHEELS")).toBeVisible();
  await expect(page.getByRole("link", { name: /Call \(321\) 682-0973/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("find-installation: manual fallback outside radius", async ({ page }) => {
  await page.goto("/find-installation?zip=33801"); // Lakeland ~40mi > 35mi radius
  await expect(page.getByText(/locating an installer near you/i)).toBeVisible();
  await expect(page.locator('input[name="name"]')).toBeVisible(); // fallback lead form
});

test("dual-channel paths reachable on all viewports", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    // full nav + both journeys live in the hamburger menu on phones
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("link", { name: "Get Wholesale Quote" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Find Installation", exact: true }).first()).toBeVisible();
  } else {
    const header = page.locator("header");
    await expect(header.getByText("Dealers:")).toBeVisible();
    await expect(header.getByText("Consumers:")).toBeVisible();
  }
  // and the homepage body repeats both paths (spec §7)
  await expect(page.getByRole("heading", { name: "Need Tires Installed?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buying for Your Business?" })).toBeVisible();
});

test("consumer request page: bad token 404s", async ({ request }) => {
  expect((await request.get("/request/not-a-real-token-guess")).status()).toBe(404);
});

test("send-to-installer page renders the 3-step form", async ({ page }) => {
  await page.goto("/send-to-installer");
  await expect(page.locator('input[name="installerName"]')).toBeVisible();
  await expect(page.locator('input[name="installerZip"]')).toBeVisible();
  await expect(page.locator('input[name="consent"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("shop-request: guessed token 404s", async ({ request }) => {
  expect((await request.get("/shop-request/guessed-token-abc")).status()).toBe(404);
});

test("tire size calculator computes and warns", async ({ page }) => {
  await page.goto("/tools/tire-size-calculator");
  // defaults: 205/75R15 vs 235/80R16 → big diff, warning shown
  await expect(page.getByText(/% larger in diameter/)).toBeVisible();
  await expect(page.getByText(/More than 3%/)).toBeVisible();
  // type a size into the second picker → same size as first → within 3%
  await page.locator('input[id="New tire-q"]').fill("205/75R15");
  await expect(page.getByText(/Within the ±3% rule/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("tire calculator accepts off-road flotation sizes (33X12.50R20)", async ({ page }) => {
  await page.goto("/tools/tire-size-calculator");
  await page.locator('input[id="Current tire-q"]').fill("33/12.50R20");
  await page.locator('input[id="New tire-q"]').fill("37X13.50R24");
  await expect(page.getByText(/37X13.5R24 is 12.1% larger/)).toBeVisible();
  // picker headers reflect the active off-road sizes
  await expect(page.getByText(/— 33X12.5R20/).first()).toBeVisible();
});

test("tire calculator: digits-only shorthand and off-road dropdowns", async ({ page }) => {
  await page.goto("/tools/tire-size-calculator");
  // digits-only metric: 2055516 → 205/55R16
  await page.locator('input[id="Current tire-q"]').fill("2055516");
  await expect(page.getByText(/Current tire.*205\/55R16/i).first()).toBeVisible();
  // digits-only flotation: 33125020 → 33X12.50R20
  await page.locator('input[id="New tire-q"]').fill("33125020");
  await expect(page.getByText(/New tire.*33X12.5R20/i).first()).toBeVisible();
  // off-road tab switches dropdowns to diameter/width/rim inches
  await page.getByRole("button", { name: /Off-Road/ }).first().click();
  await expect(page.locator('select[id="Current tire-fd"]')).toBeVisible();
});
