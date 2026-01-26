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
  const parts = dateStr.split("/").map(Number);
  const [first, second, year] = parts;

  let day: number, month: number;

  if (first > 12) {
    // First part > 12, must be day (DD/MM/YYYY)
    day = first;
    month = second;
  } else if (second > 12) {
    // Second part > 12, must be day (MM/DD/YYYY)
    month = first;
    day = second;
  } else {
    // Both <= 12, ambiguous - default to DD/MM/YYYY
    day = first;
    month = second;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTimeTo24Hour(timeStr: string): { hours: number; minutes: number; seconds: number } {
  const cleaned = timeStr.trim().toUpperCase();

  const isPM = cleaned.includes("PM");
  const isAM = cleaned.includes("AM");
  const is12Hour = isPM || isAM;

  const timeOnly = cleaned.replace(/\s*(AM|PM)\s*/gi, "").trim();
  const parts = timeOnly.split(":").map(Number);
  let hours = parts[0];
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;

  if (is12Hour) {
    if (isPM && hours !== 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    }
  }

  return { hours, minutes, seconds };
}

function formatTimeTo12Hour(hours: number, minutes: number, seconds: number): string {
  const period = hours >= 12 ? "PM" : "AM";
  let displayHours = hours % 12;
  if (displayHours === 0) displayHours = 12;
  return `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${period}`;
}

function formatTimeTo24Hour(hours: number, minutes: number, seconds: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function detectTimeFormat(page: Page): Promise<"12" | "24"> {
  // Check existing time displays in the UI
  const timeDisplays = page.locator('//span[contains(@data-testid, "time")]');
  const count = await timeDisplays.count();

  if (count > 0) {
    const timeText = await timeDisplays.first().textContent();
    if (timeText && /AM|PM/i.test(timeText)) {
      return "12";
    }
    return "24";
  }

  // Fallback: check placeholder or existing value of time input
  const timeInput = page.locator('//input[@type="time"]').first();
  if (await timeInput.count() > 0) {
    const placeholder = await timeInput.getAttribute("placeholder");
    if (placeholder && /AM|PM/i.test(placeholder)) {
      return "12";
    }
  }

  // Default to 24-hour format
  return "24";
}

function formatTime(timeStr: string, format: "12" | "24"): string {
  const { hours, minutes, seconds } = parseTimeTo24Hour(timeStr);

  if (format === "12") {
    return formatTimeTo12Hour(hours, minutes, seconds);
  }
  return formatTimeTo24Hour(hours, minutes, seconds);
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

async function fillTimeAllocationsForm(page: Page, dateStr: string, timeFormat: "12" | "24") {
  await fillInputWithKeyboard(page, '//input[@type="date"]', dateStr);
  await fillInputWithKeyboard(
    page,
    '//input[@aria-label="Project"]',
    process.env.PROJECT || ""
  );
  await fillInputWithKeyboard(
    page,
    '//input[@type="time"]',
    formatTime(process.env.TIME_DEDICATED || "", timeFormat)
  );
}

async function fillTimesheetForm(page: Page, dateStr: string, timeFormat: "12" | "24") {
  await fillInputWithKeyboard(page, '//input[@type="date"]', dateStr);

  await fillInputWithKeyboard(
    page,
    '(//input[@type="time"])[1]',
    formatTime(process.env.CLOCK_IN_SHIFT_1 || "", timeFormat)
  );
  await fillInputWithKeyboard(
    page,
    '(//input[@type="time"])[2]',
    formatTime(process.env.CLOCK_OUT_SHIFT_1 || "", timeFormat)
  );
  await fillInputWithKeyboard(
    page,
    '(//input[@type="time"])[3]',
    formatTime(process.env.CLOCK_IN_SHIFT_2 || "", timeFormat)
  );
  await fillInputWithKeyboard(
    page,
    '(//input[@type="time"])[4]',
    formatTime(process.env.CLOCK_OUT_SHIFT_2 || "", timeFormat)
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

  /* -------- DETECT TIME FORMAT FROM UI -------- */
  const timeFormat = await detectTimeFormat(page);
  console.log(`Detected time format: ${timeFormat}-hour`);

  /* -------- TIMEALLOCATIONS -------- */
  for (const dateStr of workingDays) {
    await addEntryIfMissing(page, "TIMEALLOCATIONS", dateStr, () =>
      fillTimeAllocationsForm(page, dateStr, timeFormat)
    );
  }

  /* -------- TIMESHEET -------- */
  for (const dateStr of workingDays) {
    await addEntryIfMissing(page, "TIMESHEET", dateStr, () =>
      fillTimesheetForm(page, dateStr, timeFormat)
    );
  }
});
