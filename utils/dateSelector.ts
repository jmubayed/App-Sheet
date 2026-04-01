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
    console.log("\nComandos:");
    console.log("  [número]     - Seleccionar/deseleccionar un día");
    console.log("  remove [#]   - Quitar fecha de la lista (ej: 'remove 1')");
    console.log("  n / p        - Mes siguiente / anterior");
    console.log("  range X-Y    - Seleccionar laborables del día X al Y (ej: 'range 1-15')");
    console.log("  month        - Seleccionar todos los laborables del mes mostrado");
    console.log("  week         - Seleccionar laborables de la semana pasada");
    console.log("  clear        - Borrar toda la selección");
    console.log("  location     - Cambiar ubicación para festivos");
    console.log("  done         - Guardar y salir");
    console.log("  quit         - Salir sin guardar");
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

  private askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => resolve(answer.trim().toLowerCase()));
    });
  }

  private async addDateWithHolidayCheck(date: Date): Promise<boolean> {
    const formatted = this.formatDate(date);
    const exists = this.selectedDates.some(
      (d) => this.formatDate(d) === formatted
    );
    if (exists) return false;

    if (this.isHoliday(date)) {
      const holiday = this.hd!.isHoliday(date);
      let holidayName = "Holiday";
      if (Array.isArray(holiday) && holiday.length > 0) {
        holidayName = holiday[0].name;
      }
      const answer = await this.askQuestion(`\n⚠️  ${formatted} is a holiday (${holidayName}). Include? (y/n): `);
      if (answer !== "y" && answer !== "yes") {
        console.log(`   Skipped ${formatted}`);
        return false;
      }
    }

    this.selectedDates.push(date);
    return true;
  }


  private async selectRange(startDay: number, endDay: number): Promise<void> {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (startDay < 1 || endDay > daysInMonth || startDay > endDay) {
      console.log(`\n⚠️  Invalid range. Use days between 1 and ${daysInMonth}, e.g., 'range 1-15'`);
      return;
    }

    let added = 0;
    for (let day = startDay; day <= endDay; day++) {
      const date = new Date(year, month, day);
      if (this.isWeekend(date)) continue;

      if (await this.addDateWithHolidayCheck(date)) {
        added++;
      }
    }

    console.log(`\n✓ Added ${added} weekday(s) from day ${startDay} to ${endDay}`);
  }

  private async selectDisplayedMonth(): Promise<void> {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let added = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      if (this.isWeekend(date)) continue;

      if (await this.addDateWithHolidayCheck(date)) {
        added++;
      }
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    console.log(`\n✓ Added ${added} weekday(s) from ${monthNames[month]} ${year}`);
  }

  private async selectPreviousWeek(): Promise<void> {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);

    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(today.getDate() - diffToMonday - 7);

    let added = 0;
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);

      if (await this.addDateWithHolidayCheck(date)) {
        added++;
      }
    }

    // Navegar al mes de esa semana
    this.currentMonth = new Date(monday);
    this.currentMonth.setDate(1);

    console.log(`\n✓ Added ${added} weekday(s) from last week`);
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

          this.saveConfig();
          this.rl.close();
          resolve();
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
        } else if (input.startsWith("range ") || input.startsWith("range")) {
          const rangeStr = input.replace("range", "").trim();
          const match = rangeStr.match(/^(\d+)\s*[-–]\s*(\d+)$/);
          if (match) {
            const start = parseInt(match[1]);
            const end = parseInt(match[2]);
            this.selectRange(start, end).then(() => resolve(this.prompt()));
          } else {
            console.log("\n⚠️  Invalid format. Use: range 1-15");
            setTimeout(() => resolve(this.prompt()), 1500);
          }
        } else if (input === "month") {
          this.selectDisplayedMonth().then(() => resolve(this.prompt()));
        } else if (input === "week") {
          this.selectPreviousWeek().then(() => resolve(this.prompt()));
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
