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
