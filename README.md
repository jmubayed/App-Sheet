# Playwright Timesheet Automation

Automated timesheet filling using Playwright with an interactive date selector.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install
   ```

3. **Create a `.env` file** with your credentials:
   ```env
   EMAIL=your-email@example.com
   PASSWORD=your-password
   PROJECT=your-project-name
   TIME_DEDICATED=08:00
   CLOCK_IN_SHIFT_1=09:00
   CLOCK_OUT_SHIFT_1=13:00
   CLOCK_IN_SHIFT_2=14:00
   CLOCK_OUT_SHIFT_2=18:00
   ```

## Usage

### Step 1: Select Working Days

Run the interactive calendar to choose which dates to process:

```bash
npm run select-dates
```

**First Run:** You'll be asked to set your location (country/region) for holiday detection.

**Calendar Commands:**
- **[number]** - Toggle date selection (e.g., type `15` to select/deselect the 15th)
- **remove [#]** - Remove specific date from selected list (e.g., `remove 1` removes first selected date)
- **week** - Auto-select all weekdays (Mon-Fri) of the current week
- **n** - Navigate to next month
- **p** - Navigate to previous month
- **clear** - Clear all selections
- **validate** - Check selected dates for holidays/weekends
- **location** - Change location for holiday detection
- **done** - Validate and save selections, then exit
- **quit** - Exit without saving

The tool will automatically warn you about:
- ⚠️ Weekend dates (Saturday/Sunday)
- ⚠️ Public holidays (based on your location)

Selected dates will be saved to `config/dates.json` and used by the test automation.

### Step 2: Run the Automation

```bash
npm test
```

The Playwright tests will automatically fill timesheets for your selected dates.

## Additional Scripts

- `npm run test:debug` - Run tests in debug mode
- `npm run report` - Show test report

## How It Works

1. The date selector creates an interactive calendar in your terminal
2. You select specific working days (or use `week` for quick selection)
3. Selected dates are stored in `config/dates.json`
4. Playwright reads these dates and automates timesheet entry for each one
5. The script checks for existing entries to avoid duplicates