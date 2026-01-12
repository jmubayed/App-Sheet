import { test } from "@playwright/test";

function getTodayDateMMDDYYYY(): string {
  const today = new Date();

  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const yyyy = today.getFullYear();

  return `${mm}/${dd}/${yyyy}`;
}

test("fill timesheet", async ({ page }) => {
  const todayDate = getTodayDateMMDDYYYY();

  await page.goto(
    "https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a?platform=desktop#appName=AppGallery-10305&vss=H4sIAAAAAAAAA62PvQ7CIBRGX6X5Zp6A1TgYo0uNizhguU2JLTSFWhvCuwv-xLg2jpybc_IRcNM0lV5WV_BT-L62NIMjCBzmngS4wMoaP9hWgAnsZfeCZSMHUsWkfVNkFBHP7FPx5MDDkgj_xxIGrch4XWsacjH7qfS20zm7CfyaiAzd6OWlpecXkhljYrWtRkfqmGYtnuM2Zn3vpVE7q1K4lq2j-ADEhBwBgwEAAA==&view=Shared%20with%20me"
  );

  await page.click('//button[@id="Google"]');
  await page.fill('input[type="email"]', process.env.EMAIL || "");
  await page.click('button:has-text("Next")');
  await page.fill('input[type="password"]', process.env.PASSWORD || "");
  await page.click('button:has-text("Next")');

  await page.pause();

  // Navigate to TIMEALLOCATIONS and add a new entry
  await page.click('//div[contains(text(),"TIMEALLOCATIONS")]');
  await page.click('//div[contains(text(),"Add")]');

  await page.locator('//input[@type="date"]').click();
  await page.keyboard.type(todayDate);
  await page.keyboard.press("Enter");

  await page.locator('//input[@aria-label="Project"]').click();
  await page.keyboard.type(process.env.PROJECT || "");
  await page.keyboard.press("Enter");

  await page.locator('//input[@type="time"]').click();
  await page.keyboard.type(process.env.TIME_DEDICATED || "");
  await page.keyboard.press("Enter");

  await page.click('//span[contains(text(),"Save")]');
  await page.waitForTimeout(2000);

  // Navigate to main page
  await page.goto(
    "https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a?platform=desktop#appName=AppGallery-10305&vss=H4sIAAAAAAAAA62PvQ7CIBRGX6X5Zp6A1TgYo0uNizhguU2JLTSFWhvCuwv-xLg2jpybc_IRcNM0lV5WV_BT-L62NIMjCBzmngS4wMoaP9hWgAnsZfeCZSMHUsWkfVNkFBHP7FPx5MDDkgj_xxIGrch4XWsacjH7qfS20zm7CfyaiAzd6OWlpecXkhljYrWtRkfqmGYtnuM2Zn3vpVE7q1K4lq2j-ADEhBwBgwEAAA==&view=Shared%20with%20me"
  );

  // Navigate to TIMESHEET
  await page.click('//div[contains(text(),"TIMESHEET")]');
  await page.click('//div[contains(text(),"Add")]');

  await page.locator('//input[@type="date"]').click();
  await page.keyboard.type(todayDate);
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
});
