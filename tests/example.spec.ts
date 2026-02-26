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

function detectConfigDateFormat(dateStr: string): "DD/MM/YYYY" | "MM/DD/YYYY" {
  const parts = dateStr.split("/").map(Number);
  const [first, second] = parts;

  // If first > 12, must be DD/MM/YYYY
  if (first > 12) {
    return "DD/MM/YYYY";
  }
  // If second > 12, must be MM/DD/YYYY
  if (second > 12) {
    return "MM/DD/YYYY";
  }
  // Ambiguous - default to DD/MM/YYYY (your config uses this)
  return "DD/MM/YYYY";
}

function convertDateFormat(
  dateStr: string,
  fromFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
  toFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
): string {
  const parts = dateStr.split("/");
  const [first, second, year] = parts;

  let day: string, month: string;

  // Parse based on source format
  if (fromFormat === "DD/MM/YYYY") {
    day = first;
    month = second;
  } else {
    month = first;
    day = second;
  }

  // Format based on target format
  if (toFormat === "DD/MM/YYYY") {
    return `${day}/${month}/${year}`;
  } else {
    return `${month}/${day}/${year}`;
  }
}

function normalizeDateForComparison(dateStr: string): string {
  // Remove leading zeros for comparison: 01/26/2026 -> 1/26/2026
  const parts = dateStr.split("/");
  return parts.map((p) => String(parseInt(p))).join("/");
}

function parseTimeTo24Hour(timeStr: string): {
  hours: number;
  minutes: number;
  seconds: number;
} {
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

function formatTimeTo12Hour(
  hours: number,
  minutes: number,
  seconds: number,
): string {
  const period = hours >= 12 ? "PM" : "AM";
  let displayHours = hours % 12;
  if (displayHours === 0) displayHours = 12;
  return `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${period}`;
}

function formatTimeTo24Hour(
  hours: number,
  minutes: number,
  seconds: number,
): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function detectTimeFormat(
  page: Page,
  sectionName: string,
): Promise<"12" | "24"> {
  // Use different xpath based on section
  let timeDisplays;

  if (sectionName === "TIMESHEET") {
    timeDisplays = page.locator(
      '//span[@data-testid="table-view-row"]//div[@data-testonly-column="Clock out_Shift_1"]',
    );
  } else {
    // For TIMEALLOCATIONS
    timeDisplays = page.locator(
      '//span[@data-testid="table-view-row"]//div[contains(@class, "TimeTypeDisplay")]',
    );
  }

  // Wait for time displays to be visible
  try {
    await timeDisplays.first().waitFor({ state: "visible", timeout: 5000 });
  } catch (e) {
    console.warn(
      `No time displays found for ${sectionName}, defaulting to 24-hour format`,
    );
    return "24";
  }

  const count = await timeDisplays.count();

  if (count > 0) {
    // Check the first 5 time displays (or fewer if less than 5 exist)
    const limit = Math.min(count, 5);

    for (let i = 0; i < limit; i++) {
      const timeText = await timeDisplays.nth(i).textContent();
      if (timeText && /AM|PM/i.test(timeText)) {
        return "12";
      }
    }

    // If we checked times and none had AM/PM, it's 24-hour format
    return "24";
  }

  // Fallback: check existing time displays
  const fallbackTimeDisplays = page.locator(
    '//span[contains(@data-testid, "time")]',
  );
  const timeCount = await fallbackTimeDisplays.count();

  if (timeCount > 0) {
    const timeText = await fallbackTimeDisplays.first().textContent();
    if (timeText && /AM|PM/i.test(timeText)) {
      return "12";
    }
    return "24";
  }

  // Default to 24-hour format
  return "24";
}

async function detectDateFormat(
  page: Page,
): Promise<"DD/MM/YYYY" | "MM/DD/YYYY"> {
  // Check date format from table rows
  const tableRows = page.locator('//span[@data-testid="table-view-row"]');

  // Wait for table rows to be visible
  try {
    await tableRows.first().waitFor({ state: "visible", timeout: 5000 });
  } catch (e) {
    console.warn("No table rows found, defaulting to MM/DD/YYYY format");
    return "MM/DD/YYYY";
  }

  const count = await tableRows.count();

  if (count > 0) {
    // Get text content and look for date patterns
    const rowText = await tableRows.first().textContent();

    // Look for date pattern like XX/XX/XXXX
    const dateMatch = rowText?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);

    if (dateMatch) {
      const first = parseInt(dateMatch[1]);
      const second = parseInt(dateMatch[2]);

      // If first number > 12, it must be DD/MM/YYYY
      if (first > 12) {
        return "DD/MM/YYYY";
      }
      // If second number > 12, it must be MM/DD/YYYY
      if (second > 12) {
        return "MM/DD/YYYY";
      }
    }
  }

  // Check date displays
  const dateCells = page.locator(
    '//span[@data-testid="date-type-display-span"]',
  );
  const dateCount = await dateCells.count();

  if (dateCount > 0) {
    const dateText = await dateCells.first().textContent();
    const dateMatch = dateText?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);

    if (dateMatch) {
      const first = parseInt(dateMatch[1]);
      const second = parseInt(dateMatch[2]);

      if (first > 12) {
        return "DD/MM/YYYY";
      }
      if (second > 12) {
        return "MM/DD/YYYY";
      }
    }
  }

  // Default to MM/DD/YYYY (US format)
  return "MM/DD/YYYY";
}

function formatTime(timeStr: string, format: "12" | "24"): string {
  const { hours, minutes, seconds } = parseTimeTo24Hour(timeStr);

  if (format === "12") {
    return formatTimeTo12Hour(hours, minutes, seconds);
  }
  return formatTimeTo24Hour(hours, minutes, seconds);
}

async function fillDateInput(page: Page, selector: string, dateStr: string, configFormat: "DD/MM/YYYY" | "MM/DD/YYYY") {
  // Convert config date to ISO format (YYYY-MM-DD) which is the standard for <input type="date">
  const parts = dateStr.split("/");
  let day: string, month: string, year: string;

  if (configFormat === "DD/MM/YYYY") {
    [day, month, year] = parts;
  } else {
    [month, day, year] = parts;
  }

  const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  await page.locator(selector).fill(isoDate);
}

async function fillTimeInput(page: Page, selector: string, timeStr: string) {
  // Convert any time format to HH:MM:SS (24h) which is the standard for <input type="time">
  const { hours, minutes, seconds } = parseTimeTo24Hour(timeStr);
  const time24 = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  await page.locator(selector).fill(time24);
}

async function fillInputWithKeyboard(
  page: Page,
  selector: string,
  value: string,
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
  dateStr: string,
  configFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
  pageFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
): Promise<boolean> {
  // Extract day, month, year from config date
  const parts = dateStr.split("/").map(Number);
  let day: number, month: number, year: number;

  if (configFormat === "DD/MM/YYYY") {
    [day, month, year] = parts;
  } else {
    [month, day, year] = parts;
  }

  const dateCells = page.locator(
    '//span[@data-testid="date-type-display-span"]',
  );

  await dateCells.first().waitFor({ state: "visible", timeout: 5000 });

  const existingDates = await dateCells.allTextContents();

  // Check against both possible page formats to handle ambiguous dates
  const asDDMM = normalizeDateForComparison(`${day}/${month}/${year}`);
  const asMMDD = normalizeDateForComparison(`${month}/${day}/${year}`);

  return existingDates.some((d) => {
    const normalized = normalizeDateForComparison(d.trim());
    return normalized === asDDMM || normalized === asMMDD;
  });
}

async function addEntryIfMissing(
  page: Page,
  sectionName: string,
  dateStr: string,
  fillForm: (
    timeFormat: "12" | "24",
    configFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
    pageFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
  ) => Promise<void>,
) {
  await openSection(page, sectionName);

  // Wait for table to load properly
  await page.waitForTimeout(2000);

  // Detect formats after opening the section
  const timeFormat = await detectTimeFormat(page, sectionName);
  const pageFormat = await detectDateFormat(page);
  const configFormat = detectConfigDateFormat(dateStr);

  console.log(
    `${sectionName} - Detected time format: ${timeFormat}-hour, page date format: ${pageFormat}, config date format: ${configFormat}`,
  );

  if (await entryExistsForDate(page, dateStr, configFormat, pageFormat)) {
    console.log(`${sectionName} already exists for ${dateStr}`);
    await page.goto(BASE_URL);
    return;
  }

  await page.click('//div[contains(text(),"Add")]');
  await fillForm(timeFormat, configFormat, pageFormat);
  await page.click('//span[contains(text(),"Save")]');

  await page.waitForTimeout(1500);
  await page.goto(BASE_URL);
}

async function fillTimeAllocationsForm(
  page: Page,
  dateStr: string,
  timeFormat: "12" | "24",
  configFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
  pageFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
) {
  await fillDateInput(page, '//input[@type="date"]', dateStr, configFormat);
  await fillInputWithKeyboard(
    page,
    '//input[@aria-label="Project"]',
    process.env.PROJECT || "",
  );
  await fillTimeInput(page, '//input[@type="time"]', process.env.TIME_DEDICATED || "");
}

async function fillTimesheetForm(
  page: Page,
  dateStr: string,
  timeFormat: "12" | "24",
  configFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
  pageFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
) {
  await fillDateInput(page, '//input[@type="date"]', dateStr, configFormat);

  await fillTimeInput(page, '(//input[@type="time"])[1]', process.env.CLOCK_IN_SHIFT_1 || "");
  await fillTimeInput(page, '(//input[@type="time"])[2]', process.env.CLOCK_OUT_SHIFT_1 || "");
  await fillTimeInput(page, '(//input[@type="time"])[3]', process.env.CLOCK_IN_SHIFT_2 || "");
  await fillTimeInput(page, '(//input[@type="time"])[4]', process.env.CLOCK_OUT_SHIFT_2 || "");
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
    await addEntryIfMissing(
      page,
      "TIMEALLOCATIONS",
      dateStr,
      (timeFormat, configFormat, pageFormat) =>
        fillTimeAllocationsForm(
          page,
          dateStr,
          timeFormat,
          configFormat,
          pageFormat,
        ),
    );
  }

  /* -------- TIMESHEET -------- */
  for (const dateStr of workingDays) {
    await addEntryIfMissing(
      page,
      "TIMESHEET",
      dateStr,
      (timeFormat, configFormat, pageFormat) =>
        fillTimesheetForm(page, dateStr, timeFormat, configFormat, pageFormat),
    );
  }
});
