import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import Holidays from "date-holidays";

interface DateConfig {
  selectedDates: string[];
  location?: {
    country: string;
    state?: string;
  };
}

const CONFIG_PATH = path.join(__dirname, "../config/dates.json");

export class DateSelector {
  private selectedDates: Date[] = [];
  private currentMonth: Date;
  private rl: readline.Interface;
  private hd: Holidays | null = null;
  private location: { country: string; state?: string } | null = null;

  constructor() {
    this.currentMonth = new Date();
    this.currentMonth.setDate(1);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private formatDate(date: Date): string {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private isDateSelected(date: Date): boolean {
    const formatted = this.formatDate(date);
    return this.selectedDates.some(
      (d) => this.formatDate(d) === formatted
    );
  }

  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  private isHoliday(date: Date): boolean {
    if (!this.hd) return false;
    return !!this.hd.isHoliday(date);
  }

  private getDateWarning(date: Date): string {
    const warnings: string[] = [];
    if (this.isWeekend(date)) {
      warnings.push("weekend");
    }
    if (this.isHoliday(date)) {
      const holiday = this.hd!.isHoliday(date);
      if (Array.isArray(holiday) && holiday.length > 0) {
        warnings.push(`holiday: ${holiday[0].name}`);
      } else if (holiday && typeof holiday === 'object' && 'name' in holiday) {
        warnings.push(`holiday: ${(holiday as any).name}`);
      }
    }
    return warnings.length > 0 ? ` ⚠️ ${warnings.join(", ")}` : "";
  }

  private displayCalendar(): void {
    console.clear();
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    console.log(`\n${"=".repeat(50)}`);
    console.log(`   ${monthNames[month]} ${year}`.padStart(30));
    if (this.location) {
      const locationStr = this.location.state
        ? `${this.location.country} - ${this.location.state}`
        : this.location.country;
      console.log(`   Location: ${locationStr}`.padStart(30));
    }
    console.log(`${"=".repeat(50)}\n`);
    console.log("  Sun  Mon  Tue  Wed  Thu  Fri  Sat");

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let output = "";
    for (let i = 0; i < firstDay; i++) {
      output += "     ";
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isSelected = this.isDateSelected(date);
      const dayStr = String(day).padStart(2, " ");

      if (isSelected) {
        output += ` [${dayStr}]`;
      } else {
        output += `  ${dayStr} `;
      }

      if ((firstDay + day) % 7 === 0) {
        console.log(output);
        output = "";
      }
    }

    if (output) {
      console.log(output);
    }

    console.log(`\n${"=".repeat(50)}`);
    console.log("\nSelected dates:");
    if (this.selectedDates.length === 0) {
      console.log("  (none)");
    } else {
      this.selectedDates
        .sort((a, b) => a.getTime() - b.getTime())
        .forEach((date, index) => {
          const warning = this.getDateWarning(date);
          console.log(`  ${index + 1}. ${this.formatDate(date)}${warning}`);
        });
    }

    console.log(`\n${"=".repeat(50)}`);
    console.log("\nCommands:");
    console.log("  [number]    - Toggle date selection");
    console.log("  remove [#]  - Remove specific date from list (e.g., 'remove 1')");
    console.log("  n           - Next month");
    console.log("  p           - Previous month");
    console.log("  week        - Select all weekdays in current week");
    console.log("  clear       - Clear all selections");
    console.log("  validate    - Check for holidays/weekends in selections");
    console.log("  location    - Change location for holiday detection");
    console.log("  done        - Save and exit");
    console.log("  quit        - Exit without saving");
    console.log(`${"=".repeat(50)}\n`);
  }

  private toggleDate(day: number): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const date = new Date(year, month, day);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    if (day < 1 || day > daysInMonth) {
      console.log(`Invalid day: ${day}`);
      return;
    }

    const formatted = this.formatDate(date);
    const index = this.selectedDates.findIndex(
      (d) => this.formatDate(d) === formatted
    );

    if (index >= 0) {
      this.selectedDates.splice(index, 1);
    } else {
      this.selectedDates.push(date);
    }
  }

  private selectCurrentWeekdays(): void {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    
    // Calculate days to subtract to get to Monday
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(today.getDate() - diffToMonday);

    // Select Mon-Fri of current week
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      
      const formatted = this.formatDate(date);
      const exists = this.selectedDates.some(
        (d) => this.formatDate(d) === formatted
      );
      
      if (!exists) {
        this.selectedDates.push(date);
      }
    }

    // Update current month view to show the selected week
    this.currentMonth = new Date(monday);
    this.currentMonth.setDate(1);
  }

  private saveConfig(): void {
    const config: DateConfig = {
      selectedDates: this.selectedDates
        .sort((a, b) => a.getTime() - b.getTime())
        .map((d) => this.formatDate(d)),
      location: this.location || undefined,
    };

    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`\n✓ Saved ${config.selectedDates.length} date(s) to config/dates.json`);
  }

  private validateSelections(): void {
    if (this.selectedDates.length === 0) {
      console.log("\n⚠️  No dates selected.");
      return;
    }

    const weekendDates: Date[] = [];
    const holidayDates: Date[] = [];

    this.selectedDates.forEach((date) => {
      if (this.isWeekend(date)) {
        weekendDates.push(date);
      }
      if (this.isHoliday(date)) {
        holidayDates.push(date);
      }
    });

    console.log("\n" + "=".repeat(50));
    console.log("VALIDATION RESULTS");
    console.log("=".repeat(50));

    if (weekendDates.length === 0 && holidayDates.length === 0) {
      console.log("\n✓ All selected dates are valid working days!");
    } else {
      if (weekendDates.length > 0) {
        console.log("\n⚠️  Weekend dates found:");
        weekendDates.forEach((date) => {
          const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
          console.log(`  • ${this.formatDate(date)} (${dayName})`);
        });
      }

      if (holidayDates.length > 0) {
        console.log("\n⚠️  Holiday dates found:");
        holidayDates.forEach((date) => {
          const holiday = this.hd!.isHoliday(date);
          let holidayName = "Holiday";
          if (Array.isArray(holiday) && holiday.length > 0) {
            holidayName = holiday[0].name;
          } else if (holiday && typeof holiday === 'object' && 'name' in holiday) {
            holidayName = (holiday as any).name;
          }
          console.log(`  • ${this.formatDate(date)} - ${holidayName}`);
        });
      }
    }

    console.log("=".repeat(50));
  }

  private async changeLocation(): Promise<void> {
    return new Promise((resolve) => {
      console.log("\n" + "=".repeat(50));
      console.log("CHANGE LOCATION");
      console.log("=".repeat(50));
      console.log("\nCommon country codes:");
      console.log("  US - United States");
      console.log("  ES - Spain");
      console.log("  GB - United Kingdom");
      console.log("  DE - Germany");
      console.log("  FR - France");
      console.log("  IT - Italy");
      console.log("  CA - Canada");
      console.log("  MX - Mexico");
      console.log("\n(Full list: https://www.npmjs.com/package/date-holidays)\n");

      this.rl.question("Enter country code (e.g., ES): ", (country) => {
        const countryCode = country.trim().toUpperCase();
        if (!countryCode) {
          console.log("Cancelled.");
          setTimeout(() => resolve(), 1000);
          return;
        }

        this.rl.question("Enter state/region code (optional, press Enter to skip): ", (state) => {
          const stateCode = state.trim().toUpperCase();
          
          try {
            this.hd = stateCode 
              ? new Holidays(countryCode, stateCode)
              : new Holidays(countryCode);
            this.location = {
              country: countryCode,
              state: stateCode || undefined,
            };
            console.log(`\n✓ Location set to: ${countryCode}${stateCode ? ` - ${stateCode}` : ""}`);
          } catch (error) {
            console.log(`\n❌ Invalid location. Please check the country/state codes.`);
            this.hd = null;
            this.location = null;
          }

          setTimeout(() => resolve(), 1500);
        });
      });
    });
  }

  private async prompt(): Promise<void> {
    return new Promise((resolve) => {
      this.displayCalendar();
      this.rl.question("Enter command: ", (answer) => {
        const input = answer.trim().toLowerCase();

        if (input === "done") {
          if (this.selectedDates.length === 0) {
            console.log("\nNo dates selected. Please select at least one date.");
            setTimeout(() => resolve(this.prompt()), 1500);
            return;
          }

          // Auto-validate before saving
          this.validateSelections();
          
          this.rl.question("\nProceed with saving? (yes/no): ", (confirm) => {
            if (confirm.trim().toLowerCase() === "yes" || confirm.trim().toLowerCase() === "y") {
              this.saveConfig();
              this.rl.close();
              resolve();
            } else {
              setTimeout(() => resolve(this.prompt()), 500);
            }
          });
        } else if (input === "quit") {
          console.log("\nExiting without saving.");
          this.rl.close();
          resolve();
        } else if (input === "n") {
          this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
          resolve(this.prompt());
        } else if (input === "p") {
          this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
          resolve(this.prompt());
        } else if (input === "week") {
          this.selectCurrentWeekdays();
          resolve(this.prompt());
        } else if (input === "clear") {
          this.selectedDates = [];
          resolve(this.prompt());
        } else if (input.startsWith("remove ") || input.startsWith("r ")) {
          const parts = input.split(" ");
          const indexStr = parts[1];
          const index = parseInt(indexStr);
          
          if (!isNaN(index) && index >= 1 && index <= this.selectedDates.length) {
            const sortedDates = [...this.selectedDates].sort((a, b) => a.getTime() - b.getTime());
            const dateToRemove = sortedDates[index - 1];
            const formatted = this.formatDate(dateToRemove);
            
            this.selectedDates = this.selectedDates.filter(
              (d) => this.formatDate(d) !== formatted
            );
            console.log(`\n✓ Removed ${formatted}`);
          } else {
            console.log(`\n⚠️  Invalid number. Please enter a number between 1 and ${this.selectedDates.length}`);
          }
          setTimeout(() => resolve(this.prompt()), 1000);
        } else if (input === "validate") {
          this.validateSelections();
          setTimeout(() => resolve(this.prompt()), 3000);
        } else if (input === "location") {
          this.changeLocation().then(() => resolve(this.prompt()));
        } else {
          const day = parseInt(input);
          if (!isNaN(day)) {
            this.toggleDate(day);
          } else {
            console.log(`\nUnknown command: ${input}`);
          }
          setTimeout(() => resolve(this.prompt()), 500);
        }
      });
    });
  }

  public async start(): Promise<void> {
    console.log("\n🗓️  Welcome to the Date Selector!\n");
    console.log("Select the working days for your timesheet automation.\n");
    
    // Load existing location if available
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const config: DateConfig = JSON.parse(
          fs.readFileSync(CONFIG_PATH, "utf-8")
        );
        if (config.location) {
          this.hd = config.location.state
            ? new Holidays(config.location.country, config.location.state)
            : new Holidays(config.location.country);
          this.location = config.location;
          console.log(`📍 Using saved location: ${config.location.country}${config.location.state ? ` - ${config.location.state}` : ""}\n`);
        }
      }
    } catch (error) {
      // Ignore errors, just don't load location
    }

    // Set default to Madrid, Spain if not set
    if (!this.location) {
      try {
        this.hd = new Holidays("ES", "MD");
        this.location = {
          country: "ES",
          state: "MD",
        };
        console.log("📍 Default location set to: ES - MD (Madrid, Spain)\n");
        console.log("(You can change this with the 'location' command)\n");
      } catch (error) {
        console.log("⚠️  Could not set default location\n");
      }
    }

    await this.prompt();
  }
}

// Load existing dates from config
export function loadSelectedDates(): string[] {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config: DateConfig = JSON.parse(
        fs.readFileSync(CONFIG_PATH, "utf-8")
      );
      return config.selectedDates || [];
    }
  } catch (error) {
    console.error("Error loading dates config:", error);
  }
  return [];
}

// Run selector if executed directly
if (require.main === module) {
  const selector = new DateSelector();
  selector.start().then(() => {
    process.exit(0);
  });
}
