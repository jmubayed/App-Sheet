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

  let format: "DD/MM/YYYY" | "MM/DD/YYYY";

  // If first > 12, must be DD/MM/YYYY
  if (first > 12) {
    format = "DD/MM/YYYY";
    console.log(`📋 [CONFIG FORMAT] "${dateStr}" → ${format} (first=${first} > 12)`);
  }
  // If second > 12, must be MM/DD/YYYY
  else if (second > 12) {
    format = "MM/DD/YYYY";
    console.log(`📋 [CONFIG FORMAT] "${dateStr}" → ${format} (second=${second} > 12)`);
  }
  // Ambiguous - default to DD/MM/YYYY (your config uses this)
  else {
    format = "DD/MM/YYYY";
    console.log(`📋 [CONFIG FORMAT] "${dateStr}" → ${format} (AMBIGUOUS, both ≤ 12, defaulting to DD/MM/YYYY)`);
  }

  return format;
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
  // Use getAllDatesFromVirtualizedTable which scrolls through the whole table
  const allDates = await getAllDatesFromVirtualizedTable(page);

  console.log(`📅 [DATE FORMAT] Analyzing ${allDates.length} dates from table`);

  for (const dateText of allDates) {
    const dateMatch = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateMatch) {
      const first = parseInt(dateMatch[1]);
      const second = parseInt(dateMatch[2]);

      if (first > 12) {
        console.log(`📅 [DATE FORMAT] ✅ Detected DD/MM/YYYY — "${dateText}" has first=${first} > 12`);
        return "DD/MM/YYYY";
      }
      if (second > 12) {
        console.log(`📅 [DATE FORMAT] ✅ Detected MM/DD/YYYY — "${dateText}" has second=${second} > 12`);
        return "MM/DD/YYYY";
      }
    }
  }

  console.warn(`⚠️ [DATE FORMAT] All dates ambiguous. Defaulting to DD/MM/YYYY`);
  return "DD/MM/YYYY";
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
  console.log(`📝 [FILL DATE] "${dateStr}" (configFormat=${configFormat}) → day=${day}, month=${month}, year=${year} → ISO: ${isoDate}`);
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

async function getAllDatesFromVirtualizedTable(page: Page): Promise<string[]> {
  // The table is virtualized — only visible rows are rendered.
  // We need to scroll through the entire table to collect all dates.
  const dateSelector = '//div[@data-testonly-column="Date"]//span[@data-testid="date-type-display-span"]';

  try {
    await page.locator(dateSelector).first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    return [];
  }

  const allDates = new Set<string>();

  // Read initial visible dates
  let visibleDates = await page.locator(dateSelector).allTextContents();
  visibleDates.forEach((d) => allDates.add(d.trim()));

  // Scroll through the virtualized table to load all rows
  const tableList = page.locator('.TableView__list');
  let previousSize = 0;
  let scrollAttempts = 0;

  while (scrollAttempts < 20) {
    await tableList.evaluate((el) => el.scrollBy(0, 400));
    await page.waitForTimeout(300);

    visibleDates = await page.locator(dateSelector).allTextContents();
    visibleDates.forEach((d) => allDates.add(d.trim()));

    if (allDates.size === previousSize) {
      scrollAttempts++;
      if (scrollAttempts >= 3) break; // No new dates after 3 scrolls
    } else {
      scrollAttempts = 0;
    }
    previousSize = allDates.size;
  }

  // Scroll back to top
  await tableList.evaluate((el) => el.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const result = Array.from(allDates);
  console.log(`📜 [SCROLL] Collected ${result.length} unique dates from virtualized table`);
  return result;
}

async function entryExistsForDate(
  page: Page,
  dateStr: string,
  configFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
  pageFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
): Promise<boolean> {
  const existingDates = await getAllDatesFromVirtualizedTable(page);
  return dateMatchesExisting(dateStr, configFormat, existingDates);
}

async function getExistingDates(page: Page): Promise<string[]> {
  return getAllDatesFromVirtualizedTable(page);
}

function dateMatchesExisting(
  dateStr: string,
  configFormat: "DD/MM/YYYY" | "MM/DD/YYYY",
  existingDates: string[],
): boolean {
  const parts = dateStr.split("/").map(Number);
  let day: number, month: number, year: number;

  if (configFormat === "DD/MM/YYYY") {
    [day, month, year] = parts;
  } else {
    [month, day, year] = parts;
  }

  const asDDMM = normalizeDateForComparison(`${day}/${month}/${year}`);
  const asMMDD = normalizeDateForComparison(`${month}/${day}/${year}`);

  return existingDates.some((d) => {
    const normalized = normalizeDateForComparison(d);
    return normalized === asDDMM || normalized === asMMDD;
  });
}

async function checkFiledDates(
  page: Page,
  sectionName: string,
  datesToCheck: string[],
): Promise<void> {
  if (datesToCheck.length === 0) {
    console.log(`\n📊 [${sectionName}] No hay fechas para comprobar`);
    return;
  }

  await openSection(page, sectionName);
  await page.waitForTimeout(2000);

  const configFormat = detectConfigDateFormat(datesToCheck[0]);
  const existingDates = await getExistingDates(page);

  const filed: string[] = [];
  const pending: string[] = [];

  for (const dateStr of datesToCheck) {
    if (dateMatchesExisting(dateStr, configFormat, existingDates)) {
      filed.push(dateStr);
    } else {
      pending.push(dateStr);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`📊 [${sectionName}] RESUMEN DE FICHAJES`);
  console.log(`${"=".repeat(50)}`);
  console.log(`   Total fechas seleccionadas: ${datesToCheck.length}`);
  console.log(`   ✅ Ya fichadas: ${filed.length}`);
  console.log(`   ❌ Pendientes:  ${pending.length}`);

  if (filed.length > 0) {
    console.log(`\n   ✅ Fichadas:`);
    filed.forEach((d) => console.log(`      - ${d}`));
  }
  if (pending.length > 0) {
    console.log(`\n   ❌ Pendientes:`);
    pending.forEach((d) => console.log(`      - ${d}`));
  }
  console.log(`${"=".repeat(50)}\n`);

  await page.goto(BASE_URL);
}

function parseDateToObj(
  dateStr: string,
  format: "DD/MM/YYYY" | "MM/DD/YYYY",
): Date {
  const parts = dateStr.split("/").map(Number);
  let day: number, month: number, year: number;

  if (format === "DD/MM/YYYY") {
    [day, month, year] = parts;
  } else {
    [month, day, year] = parts;
  }

  return new Date(year, month - 1, day);
}

function formatDateAsConfig(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getDatesInRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    dates.push(formatDateAsConfig(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

async function getAbsenceDates(
  page: Page,
  datesToCheck: string[],
): Promise<string[]> {
  // Navigate to ABSENCES > List - My Absences
  await openSection(page, "ABSENCES");
  await page.waitForTimeout(2000);
  const listBtn = page.locator('div[role="button"][title="List - My Absences"]');
  await listBtn.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(500);
  await listBtn.click();
  await page.waitForTimeout(3000);

  // Read absence rows — use CSS selectors to scope within each row
  const rows = page.locator('span[data-testid="table-view-row"]');

  let allAbsenceDays: string[] = [];

  try {
    await rows.first().waitFor({ state: "visible", timeout: 5000 });
    const rowCount = await rows.count();

    console.log(`🏥 [ABSENCES] Found ${rowCount} absence rows`);

    // First pass: collect all dates to detect the format
    const rowData: { startStr: string; endStr: string }[] = [];
    let absencePageFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | null = null;

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const startCell = row.locator('div[data-testonly-column="Start_Date"] span[data-testid="date-type-display-span"]');
      const endCell = row.locator('div[data-testonly-column="End_Date"] span[data-testid="date-type-display-span"]');

      if ((await startCell.count()) === 0 || (await endCell.count()) === 0) continue;

      const startStr = (await startCell.first().textContent())?.trim() || "";
      const endStr = (await endCell.first().textContent())?.trim() || "";

      if (!startStr || !endStr) continue;
      rowData.push({ startStr, endStr });

      // Try to detect format from any unambiguous date
      if (!absencePageFormat) {
        for (const d of [startStr, endStr]) {
          const parts = d.split("/").map(Number);
          if (parts[0] > 12) { absencePageFormat = "DD/MM/YYYY"; break; }
          if (parts[1] > 12) { absencePageFormat = "MM/DD/YYYY"; break; }
        }
      }
    }

    // Default to DD/MM/YYYY if all dates are ambiguous
    if (!absencePageFormat) absencePageFormat = "DD/MM/YYYY";
    console.log(`🏥 [ABSENCES] Detected page date format: ${absencePageFormat}`);

    // Second pass: parse dates with the detected format
    for (let i = 0; i < rowData.length; i++) {
      const { startStr, endStr } = rowData[i];

      const startDate = parseDateToObj(startStr, absencePageFormat);
      const endDate = parseDateToObj(endStr, absencePageFormat);

      console.log(`🏥 [ABSENCES] Row ${i}: "${startStr}" → "${endStr}" | Parsed: ${startDate.toISOString().split("T")[0]} → ${endDate.toISOString().split("T")[0]}`);

      const rangeDates = getDatesInRange(startDate, endDate);
      console.log(`   📅 ${rangeDates.length} day(s) in range`);

      allAbsenceDays = allAbsenceDays.concat(rangeDates);
    }
  } catch {
    console.log(`✅ [ABSENCES] No absences found on page`);
  }

  console.log(`\n🏥 [ABSENCES] Total absence days collected: ${allAbsenceDays.length}`);
  if (allAbsenceDays.length > 0) {
    console.log(`   ${allAbsenceDays.join(", ")}`);
  }

  // Match against selected dates
  const configFormat = detectConfigDateFormat(datesToCheck[0]);
  const matchedAbsences: string[] = [];

  console.log(`\n🏥 [ABSENCES] Comparing against selected dates (configFormat=${configFormat}):`);
  for (const dateStr of datesToCheck) {
    const dateObj = parseDateToObj(dateStr, configFormat);
    const asConfig = formatDateAsConfig(dateObj);
    const match = allAbsenceDays.includes(asConfig);
    console.log(`   "${dateStr}" → normalized: "${asConfig}" → ${match ? "MATCH (absence)" : "no match"}`);

    if (match) {
      matchedAbsences.push(dateStr);
    }
  }

  if (matchedAbsences.length > 0) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`🏥 [ABSENCES] AUSENCIAS DETECTADAS`);
    console.log(`${"=".repeat(50)}`);
    matchedAbsences.forEach((d) => console.log(`   - ${d}`));
    console.log(`${"=".repeat(50)}\n`);
  } else {
    console.log(`\n✅ [ABSENCES] No hay ausencias en las fechas seleccionadas\n`);
  }

  await page.goto(BASE_URL);
  return matchedAbsences;
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
): Promise<"added" | "skipped"> {
  await openSection(page, sectionName);

  // Wait for table to load properly
  await page.waitForTimeout(2000);

  // Detect formats after opening the section
  const timeFormat = await detectTimeFormat(page, sectionName);
  const pageFormat = await detectDateFormat(page);
  const configFormat = detectConfigDateFormat(dateStr);

  if (await entryExistsForDate(page, dateStr, configFormat, pageFormat)) {
    console.log(`      ⏭️  ${dateStr} ya fichado en ${sectionName} — saltando`);
    await page.goto(BASE_URL);
    return "skipped";
  }

  console.log(`      ✏️  ${dateStr} no encontrado en ${sectionName} — añadiendo...`);
  await page.click('//div[contains(text(),"Add")]');
  await fillForm(timeFormat, configFormat, pageFormat);
  await page.click('//span[contains(text(),"Save")]');
  console.log(`      ✅ ${dateStr} guardado en ${sectionName}`);

  await page.waitForTimeout(1500);
  await page.goto(BASE_URL);
  return "added";
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

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚀 INICIO — ${workingDays.length} días seleccionados`);
  console.log(`${"=".repeat(60)}`);
  workingDays.forEach((d) => console.log(`   - ${d}`));

  console.log(`\n📌 [PASO 1/5] Navegando a la app...`);
  await page.goto(BASE_URL);

  /* -------- LOGIN -------- */
  console.log(`📌 [PASO 2/5] Login con Google...`);
  await page.click('//button[@id="Google"]');
  await page.fill('input[type="text"]', process.env.EMAIL || "");
  await page.click('button:has-text("Next")');
  await page.fill('input[type="password"]', process.env.PASSWORD || "");
  await page.click('button:has-text("Next")');

  await page.pause();

  // Track results for summary
  const results = {
    totalSelected: workingDays.length,
    absences: [] as string[],
    filteredDays: [] as string[],
    timeAllocations: { added: [] as string[], skipped: [] as string[] },
    timesheet: { added: [] as string[], skipped: [] as string[] },
  };

  /* -------- CHECK ABSENCES -------- */
  console.log(`\n📌 [PASO 3/6] Comprobando ausencias...`);
  const absenceDates = await getAbsenceDates(page, workingDays);
  results.absences = absenceDates;
  const filteredDays = workingDays.filter((d) => !absenceDates.includes(d));
  results.filteredDays = filteredDays;

  if (filteredDays.length < workingDays.length) {
    console.log(`📋 Fichando ${filteredDays.length} de ${workingDays.length} días (${absenceDates.length} ausencia(s) excluidas)`);
  } else {
    console.log(`📋 Fichando ${filteredDays.length} días (sin ausencias)`);
  }

  /* -------- CHECK STATUS -------- */
  console.log(`\n📌 [PASO 4/6] Comprobando estado actual de fichajes...`);
  await checkFiledDates(page, "TIMEALLOCATIONS", filteredDays);
  await checkFiledDates(page, "TIMESHEET", filteredDays);

  /* -------- TIMEALLOCATIONS -------- */
  console.log(`\n📌 [PASO 5/6] Rellenando TIMEALLOCATIONS...`);
  for (let i = 0; i < filteredDays.length; i++) {
    const dateStr = filteredDays[i];
    console.log(`   ➡️  [${i + 1}/${filteredDays.length}] ${dateStr}`);
    const result = await addEntryIfMissing(
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
    results.timeAllocations[result === "added" ? "added" : "skipped"].push(dateStr);
  }
  console.log(`   ✅ TIMEALLOCATIONS completado`);

  /* -------- TIMESHEET -------- */
  console.log(`\n📌 [PASO 6/6] Rellenando TIMESHEET...`);
  for (let i = 0; i < filteredDays.length; i++) {
    const dateStr = filteredDays[i];
    console.log(`   ➡️  [${i + 1}/${filteredDays.length}] ${dateStr}`);
    const result = await addEntryIfMissing(
      page,
      "TIMESHEET",
      dateStr,
      (timeFormat, configFormat, pageFormat) =>
        fillTimesheetForm(page, dateStr, timeFormat, configFormat, pageFormat),
    );
    results.timesheet[result === "added" ? "added" : "skipped"].push(dateStr);
  }
  console.log(`   ✅ TIMESHEET completado`);

  /* -------- RESUMEN FINAL -------- */
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 RESUMEN FINAL`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\n   📅 Días seleccionados:        ${results.totalSelected}`);
  console.log(`   🏥 Ausencias excluidas:        ${results.absences.length}`);
  if (results.absences.length > 0) {
    results.absences.forEach((d) => console.log(`      - ${d}`));
  }
  console.log(`   📋 Días a procesar:            ${results.filteredDays.length}`);

  console.log(`\n   ⏱️  TIMEALLOCATIONS:`);
  console.log(`      ✅ Añadidos:  ${results.timeAllocations.added.length}`);
  if (results.timeAllocations.added.length > 0) {
    results.timeAllocations.added.forEach((d) => console.log(`         + ${d}`));
  }
  console.log(`      ⏭️  Saltados:  ${results.timeAllocations.skipped.length}`);
  if (results.timeAllocations.skipped.length > 0) {
    results.timeAllocations.skipped.forEach((d) => console.log(`         - ${d}`));
  }

  console.log(`\n   🕐 TIMESHEET:`);
  console.log(`      ✅ Añadidos:  ${results.timesheet.added.length}`);
  if (results.timesheet.added.length > 0) {
    results.timesheet.added.forEach((d) => console.log(`         + ${d}`));
  }
  console.log(`      ⏭️  Saltados:  ${results.timesheet.skipped.length}`);
  if (results.timesheet.skipped.length > 0) {
    results.timesheet.skipped.forEach((d) => console.log(`         - ${d}`));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎉 FINALIZADO`);
  console.log(`${"=".repeat(60)}\n`);
});
