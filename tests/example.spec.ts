import { Page, test } from "@playwright/test";
import { loadSelectedDates } from "../utils/dateSelector";

/* ---------------- TIME & DATE HELPERS ---------------- */

function getSelectedWorkingDays(): string[] {
  const dates = loadSelectedDates();
  
  if (dates.length === 0) {
    console.warn("⚠️  No dates selected! Run 'npm run select-dates' first.");
    console.warn("Using empty array - no entries will be processed.");
  }
  
  return dates;
}

function normalizeDate(dateStr: string): string {
  const [m, d, y] = dateStr.split("/").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ---------------- HELPERS ---------------- */

async function entryExistsForDate(
  page: Page,
  dateStr: string
): Promise<boolean> {
  const target = normalizeDate(dateStr);

  const dateCells = page.locator(
    '//span[@data-testid="date-type-display-span"]'
  );

  // ⏳ Wait until at least one date is rendered (or timeout)
  await dateCells.first().waitFor({ state: "visible", timeout: 5000 });

  const existingDates = await dateCells.allTextContents();

  console.log("Existing dates:", existingDates);

  return existingDates.some((d) => normalizeDate(d.trim()) === target);
}

/* ---------------- PLAYWRIGHT TEST ---------------- */

test("fill timesheet for selected working days", async ({ page }) => {
  const workingDays = getSelectedWorkingDays();

  if (workingDays.length === 0) {
    console.log("❌ No dates selected. Skipping test.");
    console.log("Run 'npm run select-dates' to choose dates.");
    return;
  }

  console.log("Working days to fill:", workingDays);

  await page.goto(
    "https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a?platform=desktop#appName=AppGallery-10305&view=Shared%20with%20me"
  );

  // ---- LOGIN ----
  await page.click('//button[@id="Google"]');
  await page.fill('input[type="email"]', process.env.EMAIL || "");
  await page.click('button:has-text("Next")');
  await page.fill('input[type="password"]', process.env.PASSWORD || "");
  await page.click('button:has-text("Next")');

  await page.pause();

  for (const dateStr of workingDays) {
    /* -------- TIMEALLOCATIONS -------- */
    await page.click('//div[contains(text(),"TIMEALLOCATIONS")]');

    if (await entryExistsForDate(page, dateStr)) {
      console.log(`TIMEALLOCATIONS already exists for ${dateStr}`);
      await page.goto(
        "https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a?platform=desktop#appName=AppGallery-10305&view=Shared%20with%20me"
      );
      continue;
    }

    await page.click('//div[contains(text(),"Add")]');

    await page.locator('//input[@type="date"]').click();
    await page.keyboard.type(dateStr);
    await page.keyboard.press("Enter");

    await page.locator('//input[@aria-label="Project"]').click();
    await page.keyboard.type(process.env.PROJECT || "");
    await page.keyboard.press("Enter");

    await page.locator('//input[@type="time"]').click();
    await page.keyboard.type(process.env.TIME_DEDICATED || "");
    await page.keyboard.press("Enter");

    await page.click('//span[contains(text(),"Save")]');
    await page.waitForTimeout(1500);
    await page.goto(
      "https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a?platform=desktop#appName=AppGallery-10305&view=Shared%20with%20me"
    );
  }

  for (const dateStr of workingDays) {
    /* -------- TIMESHEET -------- */
    await page.click('//div[contains(text(),"TIMESHEET")]');

    if (await entryExistsForDate(page, dateStr)) {
      console.log(`TIMESHEET already exists for ${dateStr}`);
      await page.goto(
        "https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a?platform=desktop#appName=AppGallery-10305&view=Shared%20with%20me"
      );
      continue;
    }

    await page.click('//div[contains(text(),"Add")]');

    await page.locator('//input[@type="date"]').click();
    await page.keyboard.type(dateStr);
    await page.keyboard.press("Enter");

    await page.locator('(//input[@type="time"])[1]').click();
    await page.keyboard.type(process.env.CLOCK_IN_SHIFT_1 || "");
    await page.keyboard.press("Enter");

    await page.locator('(//input[@type="time"])[2]').click();
    await page.keyboard.type(process.env.CLOCK_OUT_SHIFT_1 || "");
    await page.keyboard.press("Enter");

    await page.locator('(//input[@type="time"])[3]').click();
    await page.keyboard.type(process.env.CLOCK_IN_SHIFT_2 || "");
    await page.keyboard.press("Enter");

    await page.locator('(//input[@type="time"])[4]').click();
    await page.keyboard.type(process.env.CLOCK_OUT_SHIFT_2 || "");
    await page.keyboard.press("Enter");

    await page.waitForTimeout(2000);
    await page.click('//span[contains(text(),"Save")]');
    await page.waitForTimeout(3000);
    await page.goto(
      "https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a?platform=desktop#appName=AppGallery-10305&view=Shared%20with%20me"
    );
  }
});
