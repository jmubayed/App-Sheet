import { Page, test } from "@playwright/test";
import { loadSelectedDates } from "../utils/dateSelector";

const BASE_URL =
  "https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a?platform=desktop#appName=AppGallery-10305&view=Shared%20with%20me";

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

async function fillInputWithKeyboard(
  page: Page,
  selector: string,
  value: string
) {
  await page.locator(selector).click();
  await page.keyboard.type(value);
  await page.keyboard.press("Enter");
}

async function openSection(page: Page, sectionName: string) {
  await page.click(`//div[contains(text(),"${sectionName}")]`);
}

async function entryExistsForDate(
  page: Page,
  dateStr: string
): Promise<boolean> {
  const target = normalizeDate(dateStr);

  const dateCells = page.locator(
    '//span[@data-testid="date-type-display-span"]'
  );

  await dateCells.first().waitFor({ state: "visible", timeout: 5000 });

  const existingDates = await dateCells.allTextContents();

  return existingDates.some((d) => normalizeDate(d.trim()) === target);
}

async function addEntryIfMissing(
  page: Page,
  sectionName: string,
  dateStr: string,
  fillForm: () => Promise<void>
) {
  await openSection(page, sectionName);

  if (await entryExistsForDate(page, dateStr)) {
    console.log(`${sectionName} already exists for ${dateStr}`);
    await page.goto(BASE_URL);
    return;
  }

  await page.click('//div[contains(text(),"Add")]');
  await fillForm();
  await page.click('//span[contains(text(),"Save")]');

  await page.waitForTimeout(1500);
  await page.goto(BASE_URL);
}

async function fillTimeAllocationsForm(page: Page, dateStr: string) {
  await fillInputWithKeyboard(page, '//input[@type="date"]', dateStr);
  await fillInputWithKeyboard(
    page,
    '//input[@aria-label="Project"]',
    process.env.PROJECT || ""
  );
  await fillInputWithKeyboard(
    page,
    '//input[@type="time"]',
    process.env.TIME_DEDICATED || ""
  );
}

async function fillTimesheetForm(page: Page, dateStr: string) {
  await fillInputWithKeyboard(page, '//input[@type="date"]', dateStr);

  await fillInputWithKeyboard(
    page,
    '(//input[@type="time"])[1]',
    process.env.CLOCK_IN_SHIFT_1 || ""
  );
  await fillInputWithKeyboard(
    page,
    '(//input[@type="time"])[2]',
    process.env.CLOCK_OUT_SHIFT_1 || ""
  );
  await fillInputWithKeyboard(
    page,
    '(//input[@type="time"])[3]',
    process.env.CLOCK_IN_SHIFT_2 || ""
  );
  await fillInputWithKeyboard(
    page,
    '(//input[@type="time"])[4]',
    process.env.CLOCK_OUT_SHIFT_2 || ""
  );
}

test("fill timesheet for selected working days", async ({ page }) => {
  const workingDays = getSelectedWorkingDays();

  if (workingDays.length === 0) {
    console.log("❌ No dates selected. Skipping test.");
    return;
  }

  console.log("Working days to fill:", workingDays);

  await page.goto(BASE_URL);

  /* -------- LOGIN -------- */
  await page.click('//button[@id="Google"]');
  await page.fill('input[type="email"]', process.env.EMAIL || "");
  await page.click('button:has-text("Next")');
  await page.fill('input[type="password"]', process.env.PASSWORD || "");
  await page.click('button:has-text("Next")');

  await page.pause();

  /* -------- TIMEALLOCATIONS -------- */
  for (const dateStr of workingDays) {
    await addEntryIfMissing(page, "TIMEALLOCATIONS", dateStr, () =>
      fillTimeAllocationsForm(page, dateStr)
    );
  }

  /* -------- TIMESHEET -------- */
  for (const dateStr of workingDays) {
    await addEntryIfMissing(page, "TIMESHEET", dateStr, () =>
      fillTimesheetForm(page, dateStr)
    );
  }
});
