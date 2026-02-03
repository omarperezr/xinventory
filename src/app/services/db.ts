import initSqlJs from "sql.js";
import localforage from "localforage";

// Use a CDN for the WASM file
const WASM_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.wasm";

class DatabaseService {
  private db: any = null;
  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.init();
  }

  private async init() {
    try {
      const SQL = await initSqlJs({
        locateFile: () => WASM_URL,
      });

      // Try to load saved DB from local storage
      const savedDb = await localforage.getItem<Uint8Array>("inventory_db");

      if (savedDb) {
        this.db = new SQL.Database(savedDb);
        // Ensure new columns exist if we loaded an old DB
        this.migrate();
      } else {
        this.db = new SQL.Database();
        this.createTables();
        this.seedData();
      }

      this.saveToStorage();
    } catch (err) {
      console.error("Failed to initialize SQLite:", err);
    }
  }

  // Persist DB to local storage
  private saveToStorage() {
    if (this.db) {
      const data = this.db.export();
      localforage.setItem("inventory_db", data);
    }
  }

  private createTables() {
    if (!this.db) return;

    const schema = `
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        barcode TEXT NOT NULL,
        buyingPrice REAL,
        sellingPrice REAL NOT NULL,
        quantity INTEGER DEFAULT 0,
        unit TEXT DEFAULT 'units',
        includesTaxes INTEGER DEFAULT 0, -- boolean 0 or 1
        currency TEXT DEFAULT 'BS',
        discount REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        action TEXT NOT NULL,
        date TEXT NOT NULL,
        details TEXT,
        user TEXT,
        previousStock INTEGER,
        newStock INTEGER,
        FOREIGN KEY(itemId) REFERENCES items(id)
      );
      
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        subtotal REAL,
        tax REAL,
        total REAL,
        payments TEXT, -- JSON
        notes TEXT,
        userId TEXT,
        images TEXT -- JSON array
      );

      CREATE TABLE IF NOT EXISTS transaction_items (
        id TEXT PRIMARY KEY,
        transactionId TEXT NOT NULL,
        itemId TEXT NOT NULL,
        name TEXT,
        price REAL,
        quantity INTEGER,
        quantityReturned INTEGER DEFAULT 0,
        discountApplied INTEGER DEFAULT 0, -- boolean
        discountValue REAL DEFAULT 0, -- percentage
        FOREIGN KEY(transactionId) REFERENCES transactions(id)
      );
    `;

    this.db.run(schema);
  }

  private migrate() {
    // Add discount column if it doesn't exist
    try {
      this.db.run("ALTER TABLE items ADD COLUMN discount REAL DEFAULT 0");
    } catch (e) {
      // Column likely exists
    }

    try {
      this.db.run(
        "ALTER TABLE transaction_items ADD COLUMN discountApplied INTEGER DEFAULT 0",
      );
      this.db.run(
        "ALTER TABLE transaction_items ADD COLUMN discountValue REAL DEFAULT 0",
      );
    } catch (e) {
      // Columns likely exist
    }
  }

  private seedData() {
    if (!this.db) return;

    // Check if empty
    try {
      const result = this.db.exec("SELECT count(*) as count FROM items");
      if (result[0].values[0][0] === 0) {
        // Seed initial data
        const initialItems = [
          {
            id: "1",
            name: "Harina P.A.N.",
            barcode: "7590001001001",
            buyingPrice: 0.9,
            sellingPrice: 1.1,
            quantity: 50,
            unit: "units",
            includesTaxes: 1,
            currency: "BS",
            discount: 0,
          },
          {
            id: "2",
            name: "Arroz Primor",
            barcode: "7590001001002",
            buyingPrice: 0.85,
            sellingPrice: 1.2,
            quantity: 30,
            unit: "kg",
            includesTaxes: 0,
            currency: "BS",
            discount: 5,
          },
          {
            id: "3",
            name: "Aceite Mazeite",
            barcode: "7590001001003",
            buyingPrice: 2.5,
            sellingPrice: 3.5,
            quantity: 15,
            unit: "liters",
            includesTaxes: 1,
            currency: "BS",
            discount: 0,
          },
        ];

        const stmt = this.db.prepare(`
                INSERT INTO items (id, name, barcode, buyingPrice, sellingPrice, quantity, unit, includesTaxes, currency, discount)
                VALUES ($id, $name, $barcode, $buyingPrice, $sellingPrice, $quantity, $unit, $includesTaxes, $currency, $discount)
            `);

        initialItems.forEach((item: any) => {
          stmt.run({
            $id: item.id,
            $name: item.name,
            $barcode: item.barcode,
            $buyingPrice: item.buyingPrice,
            $sellingPrice: item.sellingPrice,
            $quantity: item.quantity,
            $unit: item.unit,
            $includesTaxes: item.includesTaxes ? 1 : 0,
            $currency: item.currency,
            $discount: item.discount,
          });
        });
        stmt.free();

        // Seed Rates
        this.db.run("INSERT INTO settings (key, value) VALUES ('rates', ?)", [
          JSON.stringify({ USD: 36.5, EUR: 39.2 }),
        ]);
      }
    } catch (e) {
      console.log("Error seeding", e);
    }
  }

  async waitForInit() {
    await this.readyPromise;
  }

  exec(sql: string, params?: any[]) {
    if (!this.db) throw new Error("DB not initialized");

    // If it's a SELECT
    if (sql.trim().toUpperCase().startsWith("SELECT")) {
      const res = this.db.exec(sql, params);
      if (res.length > 0) {
        const columns = res[0].columns;
        const values = res[0].values;
        return values.map((row: any) => {
          const obj: any = {};
          columns.forEach((col: any, i: any) => {
            obj[col] = row[i];
          });
          return obj;
        });
      }
      return [];
    } else {
      // INSERT, UPDATE, DELETE, ALTER
      this.db.run(sql, params);
      this.saveToStorage(); // Auto-save on mutation
      return true;
    }
  }
}

export const dbService = new DatabaseService();
