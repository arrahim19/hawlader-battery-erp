export const modules: Record<
  string,
  { title: string; description: string; phase: number; columns: string[] }
> = {
  products: {
    title: "Products",
    description: "Your battery and auto parts catalog, organized in one place.",
    phase: 3,
    columns: ["Product", "Type", "Brand / category", "Unit", "Status"],
  },
  purchases: {
    title: "Purchase",
    description: "Supplier orders, purchase costs, and stock receiving.",
    phase: 3,
    columns: ["Purchase number", "Supplier", "Date", "Receiving status"],
  },
  inventory: {
    title: "Inventory",
    description: "Know what is available, reserved, or awaiting replacement.",
    phase: 3,
    columns: ["Product", "Type", "Available quantity", "Stock status"],
  },
  sales: {
    title: "Sales",
    description:
      "Customer invoices, individual battery selections, and payments.",
    phase: 4,
    columns: ["Invoice", "Date", "Customer", "Amount", "Payment status"],
  },
  replacements: {
    title: "Replacement management",
    description:
      "A complete journey for every faulty battery and warranty claim.",
    phase: 5,
    columns: ["Claim", "Battery ID", "Source", "Supplier", "Status"],
  },
  customers: {
    title: "Customers",
    description:
      "Customer contacts, vehicles, battery sets, and account history.",
    phase: 4,
    columns: ["Customer", "Phone", "Vehicle", "Status"],
  },
  suppliers: {
    title: "Suppliers",
    description:
      "Your supplier contacts, orders, and replacement relationships.",
    phase: 3,
    columns: ["Supplier", "Company / brand", "Phone", "Status"],
  },
  accounts: {
    title: "Accounts & expenses",
    description:
      "Collections, payments, expenses, and reconciled business accounts.",
    phase: 4,
    columns: ["Reference", "Date", "Account", "Amount", "Type"],
  },
  reports: {
    title: "Reports",
    description:
      "Understand stock, sales, replacements, and business performance.",
    phase: 6,
    columns: ["Report", "Period", "Format", "Status"],
  },
  settings: {
    title: "Settings",
    description: "Shop identity, invoice preferences, and warranty policies.",
    phase: 2,
    columns: ["Setting", "Value", "Status"],
  },
  users: {
    title: "Users & permissions",
    description: "Secure access with roles enforced by the backend.",
    phase: 2,
    columns: ["Name", "Login", "Role", "Status"],
  },
};
