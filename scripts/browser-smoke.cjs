const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = process.env.TEST_URL || "http://127.0.0.1:3001";
  const suffix = randomUUID(),
    email = `browser-${suffix}@example.test`,
    password = "Browser-test-password-482!";
  const navigate = async (name) =>
    page.locator("nav").getByRole("button", { name, exact: false }).click();
  const fill = async (label, value) =>
    page.getByLabel(label, { exact: true }).fill(value);
  const saved = () =>
    page.getByText("Changes saved", { exact: true }).waitFor();
  try {
    await page.goto(base);
    await page
      .getByRole("heading", { name: "Business overview", exact: true })
      .waitFor();
    await fs.mkdir("docs/images", { recursive: true });
    await page.screenshot({ path: "docs/images/overview.png", fullPage: true });
    assert.equal(await page.getByText("+12.8%", { exact: true }).count(), 0);
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    await fill("Product name", "Demo-only tee");
    await fill("SKU", "DEMO-1");
    await fill("Category", "Apparel");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await saved();
    await navigate("Inventory");
    await page.getByPlaceholder("Search inventory…").fill("Demo-only tee");
    await page
      .getByRole("cell", { name: "Demo-only tee", exact: true })
      .waitFor();
    await page.reload();
    await page
      .getByRole("heading", { name: "Business overview", exact: true })
      .waitFor();
    await navigate("Inventory");
    await page.getByPlaceholder("Search inventory…").fill("Demo-only tee");
    await page
      .getByRole("cell", { name: "Demo-only tee", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await fill("Your name", "Browser owner");
    await fill("Business name", "Browser clothing store");
    await fill("Email address", email);
    await fill("Password", password);
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Business overview", exact: true })
      .waitFor();
    await page
      .getByText("Add a store to start tracking totals.", { exact: true })
      .waitFor();
    await navigate("Inventory");
    assert.equal(
      await page
        .getByRole("cell", { name: "Demo-only tee", exact: true })
        .count(),
      0,
    );
    await navigate("Stores");
    await page.getByRole("button", { name: "Add store", exact: true }).click();
    await fill("Store name", "Browser store");
    await fill("Address", "Test address");
    await fill("Manager", "Store owner");
    await fill("Revenue ($)", "1000");
    await fill("Expenses ($)", "400");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await saved();
    await navigate("Inventory");
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    await fill("Product name", "=1+1");
    await fill("SKU", "BROWSER-1");
    await fill("Category", "Apparel");
    await fill("Stock", "2");
    await fill("Low-stock threshold", "5");
    await fill("Selling price ($)", "25");
    await fill("Unit cost ($)", "10");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await saved();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export report", exact: true })
      .click();
    const download = await downloadEvent,
      csv = await fs.readFile(await download.path(), "utf8");
    assert.ok(csv.includes('"\'=1+1"'));
    await page.reload();
    await navigate("Inventory");
    await page.getByRole("cell", { name: "=1+1", exact: true }).waitFor();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await fill("Product name", "Verified tee");
    await fill("Stock", "6");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await saved();
    await page
      .getByRole("cell", { name: "Verified tee", exact: true })
      .waitFor();
    await navigate("Employees");
    await page
      .getByRole("button", { name: "Add employee", exact: true })
      .click();
    await fill("Full name", "Browser employee");
    await fill("Email", "employee@example.test");
    await fill("Monthly salary ($)", "500");
    await fill("Next pay date", "2026-01-31");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await saved();
    await navigate("Payroll");
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm payment", exact: true })
      .click();
    await page.getByRole("cell", { name: "2026-02-28", exact: true }).waitFor();
    await navigate("Settings");
    const form = page.locator("form.account-form");
    const staffEmail = `staff-${suffix}@example.test`;
    await form.getByLabel("Name", { exact: true }).fill("Browser staff");
    await form.getByLabel("Email", { exact: true }).fill(staffEmail);
    await form.getByLabel("Initial password", { exact: true }).fill(password);
    await form
      .getByRole("button", { name: "Create team account", exact: true })
      .click();
    await page.getByText("Account created", { exact: true }).waitFor();
    await navigate("Overview");
    await page.getByText("$1,000", { exact: true }).first().waitFor();
    await page.screenshot({
      path: "docs/images/business-workspace.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Light appearance", exact: true })
      .click();
    await page.screenshot({ path: "docs/images/dark.png", fullPage: true });
    await navigate("Inventory");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("button", { name: "Confirm delete", exact: true })
      .click();
    await page
      .getByText("No records found. Try another search or add a record.", {
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: /Browser owner Owner/ }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .first()
      .waitFor();
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .first()
      .click();
    await fill("Email address", staffEmail);
    await fill("Password", password);
    await page
      .locator(".auth-card")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Business overview", exact: true })
      .waitFor();
    await navigate("Employees");
    await page
      .getByRole("cell", { name: "Browser employee", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("columnheader", { name: "Monthly salary", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Add employee", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator("nav")
        .getByRole("button", { name: "Payroll", exact: true })
        .count(),
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "docs/images/mobile.png", fullPage: true });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Mobile page overflows horizontally",
    );
    assert.deepEqual(errors, [], "Browser runtime errors");
    console.log(
      "PASS: demo persistence; signup; authenticated store/product/employee CRUD and reload; protected CSV download; payroll month-end; team account; staff UI permissions; themes; mobile layout; no browser runtime errors.",
    );
  } catch (error) {
    await fs.mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/browser-failure.png",
      fullPage: true,
    });
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
