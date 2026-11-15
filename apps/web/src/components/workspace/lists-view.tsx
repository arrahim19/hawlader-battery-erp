"use client";
import { useState } from "react";
import {
  ArrowLeftRight,
  BatteryCharging,
  Boxes,
  Check,
  ClipboardList,
  Clock3,
  CreditCard,
  Download,
  Eye,
  Filter,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserRoundCheck,
  Users,
  TriangleAlert,
} from "lucide-react";
import {
  DesignAction,
  DetailPanel,
  EmptyTable,
  Field,
  FoundationNote,
  ModuleTabs,
  Pager,
  Panel,
  StatCard,
} from "@/components/reference-ui";
import type { DashboardData } from "@/lib/api";
import { money } from "@/lib/utils";
export function ListFilters({
  kind = "records",
  action,
}: {
  kind?: string;
  action?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  return (
    <div className="erp-filterbar">
      <label className="erp-search">
        <Search size={19} />
        <input
          aria-label={"Search " + kind}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            kind === "customers"
              ? "কাস্টমারের নাম, মোবাইল বা কোড দিয়ে খুঁজুন..."
              : kind === "replacements"
                ? "ইনভয়েস, সিরিয়াল, গ্রাহকের নাম দিয়ে খুঁজুন..."
                : "পণ্যের নাম, ব্র্যান্ড বা মডেল দিয়ে খুঁজুন..."
          }
        />
      </label>
      <select
        className="erp-select"
        aria-label="Record status"
        defaultValue="all"
      >
        <option value="all">স্ট্যাটাস: সকল</option>
        <option>Available</option>
        <option>Pending Return</option>
        <option>Sent to Company</option>
        <option>Completed</option>
      </select>
      <select className="erp-select" aria-label="Record category">
        <option>ব্র্যান্ড / গ্রুপ: সকল</option>
        <option>Battery</option>
        <option>Auto Parts</option>
      </select>
      <DesignAction variant="outline" icon={Filter} feature="অতিরিক্ত ফিল্টার">
        ফিল্টার
      </DesignAction>
      {action}
    </div>
  );
}
export function InventoryView({
  preview,
  view = "",
  data,
}: {
  preview: boolean;
  view?: string;
  data: DashboardData | null;
}) {
  const current = ["batteries", "movements", "adjustments"].includes(view)
    ? view
    : "overview";
  const count = (value?: number | string) =>
    preview || value == null ? "—" : String(value);
  return (
    <>
      <ModuleTabs
        moduleId="inventory"
        current={current}
        preview={preview}
        items={[
          { id: "overview", label: "Stock Overview", icon: Package },
          {
            id: "batteries",
            label: "Battery Stock (Unit Wise)",
            icon: BatteryCharging,
          },
          { id: "movements", label: "Stock Movement", icon: ArrowLeftRight },
          { id: "adjustments", label: "Stock Adjustment", icon: Settings2 },
        ]}
      />
      <div className="erp-stats inventory-stats">
        <StatCard
          label="মোট স্টক (ইউনিট)"
          value={count(data?.stock?.accountedUnits)}
          caption="দোকানের মালিকানাধীন মোট পরিমাণ"
          icon={BatteryCharging}
        />
        <StatCard
          label="বিক্রয়যোগ্য স্টক"
          value={count(data?.counts.availableStock)}
          caption="Available for Sale"
          icon={ShoppingCart}
        />
        <StatCard
          label="রিপ্লেসেবল"
          value={count(data?.stock?.replaceable)}
          caption="Replaceable / Faulty"
          icon={TriangleAlert}
          tone="orange"
        />
        <StatCard
          label="কোম্পানিতে পাঠানো"
          value={count(data?.counts.sentToCompany)}
          caption="Sent to Company"
          icon={Truck}
          tone="blue"
        />
        <StatCard
          label="রিজার্ভ (গ্রাহকের জন্য)"
          value={count(data?.stock?.reserved)}
          caption="Reserved"
          icon={Package}
          tone="purple"
        />
        <StatCard
          label="কম স্টক পণ্য"
          value={count(data?.counts.lowStock)}
          caption="Low Stock Items"
          icon={TriangleAlert}
          tone="red"
        />
      </div>
      <Panel>
        <ListFilters
          kind="inventory"
          action={
            <DesignAction icon={Download} feature="ইনভেন্টরি রিপোর্ট">
              রিপোর্ট (PDF)
            </DesignAction>
          }
        />
        <EmptyTable
          columns={
            current === "batteries"
              ? [
                  "#",
                  "পণ্যের নাম",
                  "Model Number",
                  "অবস্থা",
                  "মালিকানা",
                  "স্ট্যাটাস",
                  "অ্যাকশন",
                ]
              : current === "movements"
                ? [
                    "তারিখ",
                    "Product / Model Number",
                    "মুভমেন্ট",
                    "পরিমাণ",
                    "রেফারেন্স",
                    "ব্যবহারকারী",
                  ]
                : current === "adjustments"
                  ? [
                      "অ্যাডজাস্টমেন্ট নং",
                      "তারিখ",
                      "পণ্য",
                      "পরিমাণ",
                      "কারণ",
                      "অনুমোদন",
                    ]
                  : [
                      "#",
                      "পণ্যের নাম (Product)",
                      "ধরন",
                      "ব্র্যান্ড / ক্যাটাগরি",
                      "Model Number",
                      "মোট স্টক",
                      "বিক্রয়যোগ্য",
                      "রিপ্লেসেবল",
                      "রিজার্ভ",
                      "স্ট্যাটাস",
                      "অ্যাকশন",
                    ]
          }
          description="Purchase Receiving নিশ্চিত করার পর প্রকৃত স্টক এখানে দেখাবে।"
        />
        <Pager />
      </Panel>
      <FoundationNote />
    </>
  );
}
export function ReplacementView({
  preview,
  view = "",
  data,
}: {
  preview: boolean;
  view?: string;
  data: DashboardData | null;
}) {
  const current = ["new", "dispatch", "receipts", "policy"].includes(view)
    ? view
    : "list";
  const count = (value?: number) =>
    preview || value == null ? "—" : String(value);
  return (
    <>
      <ModuleTabs
        moduleId="replacements"
        current={current}
        preview={preview}
        items={[
          { id: "list", label: "Replacement Cases", icon: ClipboardList },
          { id: "new", label: "New Replacement", icon: Plus },
          { id: "dispatch", label: "Send to Company", icon: Truck },
          { id: "receipts", label: "Received from Company", icon: Package },
          { id: "policy", label: "Warranty Policy", icon: ShieldCheck },
        ]}
      />
      <div className="erp-stats">
        <StatCard
          label="মোট কেস"
          value={count(data?.replacementStages?.total)}
          caption="সব Replacement কেস"
          icon={ClipboardList}
        />
        <StatCard
          label="পেন্ডিং রিটার্ন"
          value={count(data?.replacementStages?.pendingReturn)}
          caption="ফেরত পাঠানোর অপেক্ষায়"
          icon={Clock3}
          tone="blue"
        />
        <StatCard
          label="কোম্পানিতে পাঠানো"
          value={count(data?.replacementStages?.sentToCompany)}
          caption="কোম্পানিতে পাঠানো হয়েছে"
          icon={Truck}
          tone="purple"
        />
        <StatCard
          label="পর্যালোচনাধীন"
          value={count(data?.replacementStages?.underReview)}
          caption="কোম্পানির যাচাই চলছে"
          icon={Search}
          tone="orange"
        />
        <StatCard
          label="রিপ্লেসমেন্ট পাওয়া"
          value={count(data?.replacementStages?.received)}
          caption="পরীক্ষা ও পরবর্তী ধাপের অপেক্ষায়"
          icon={Check}
        />
      </div>
      {current === "new" ? (
        <Panel title="নতুন রিপ্লেসমেন্ট" icon={ArrowLeftRight}>
          <div className="erp-form-body">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Replacement Source">
                <select>
                  <option>Before-Sale Replacement</option>
                  <option>Customer Warranty Claim</option>
                </select>
              </Field>
              <Field label="Customer / Invoice / Model Number">
                <input placeholder="Search customer, invoice or model number..." />
              </Field>
              <Field label="Product / Model Number" required>
                <select>
                  <option value="">ব্যাটারি নির্বাচন করুন</option>
                </select>
              </Field>
              <Field label="Supplier">
                <select>
                  <option value="">সাপ্লায়ার নির্বাচন করুন</option>
                </select>
              </Field>
              <Field label="অভিযোগ / Fault reason" className="md:col-span-2">
                <textarea placeholder="ব্যাটারির সমস্যা ও পরীক্ষার ফলাফল লিখুন..." />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <DesignAction icon={Plus} feature="রিপ্লেসমেন্ট রেজিস্ট্রেশন">
                Register Replacement
              </DesignAction>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <Panel className="mb-4">
            <ListFilters
              kind="replacements"
              action={<DesignAction icon={Plus}>নতুন রিপ্লেসমেন্ট</DesignAction>}
            />
          </Panel>
          <div className="master-detail-layout">
            <Panel>
              <EmptyTable
                columns={
                  current === "dispatch"
                    ? [
                        "চালান নং",
                        "কোম্পানি",
                        "পাঠানোর তারিখ",
                        "ব্যাটারি",
                        "স্ট্যাটাস",
                        "অ্যাকশন",
                      ]
                    : current === "receipts"
                      ? [
                          "রিসিভ নং",
                          "কোম্পানি",
                          "Product / Model Number",
                          "Product / Model Number",
                          "তারিখ",
                          "স্ট্যাটাস",
                        ]
                      : current === "policy"
                        ? [
                            "কোম্পানি",
                            "পণ্যের ধরন",
                            "ওয়ারেন্টি",
                            "নীতি",
                            "স্ট্যাটাস",
                          ]
                        : [
                            "#",
                            "কেস নং",
                            "ইনভয়েস নং",
                            "পণ্য",
                            "সিরিয়াল নং",
                            "গ্রাহক",
                            "জমার তারিখ",
                            "স্ট্যাটাস",
                            "অ্যাকশন",
                          ]
                }
                description="রিপ্লেসমেন্ট কেস যুক্ত হলে ব্যাটারি ও ওয়ারেন্টির ইতিহাস এখানে দেখা যাবে।"
              />
              <Pager />
            </Panel>
            <DetailPanel
              title="Replacement Details"
              rows={[
                "কেস নং",
                "স্ট্যাটাস",
                "গ্রাহকের নাম",
                "যোগাযোগ",
                "পণ্য",
                "সিরিয়াল নং",
                "ইনভয়েস নং",
                "জমার তারিখ",
                "কোম্পানিতে পাঠানোর তারিখ",
                "নোট",
              ]}
              footer={
                <DesignAction variant="outline" icon={Eye}>
                  সম্পূর্ণ বিবরণ দেখুন
                </DesignAction>
              }
            />
          </div>
        </>
      )}
      <FoundationNote />
    </>
  );
}
export function CustomerView({
  preview,
  view = "",
  data,
  supplier = false,
}: {
  preview: boolean;
  view?: string;
  data: DashboardData | null;
  supplier?: boolean;
}) {
  const current = ["new", "groups", "credit", "ledger"].includes(view)
    ? view
    : "list";
  const moduleId = supplier ? "suppliers" : "customers";
  return (
    <>
      <ModuleTabs
        moduleId={moduleId}
        current={current}
        preview={preview}
        items={[
          {
            id: "list",
            label: supplier ? "Supplier List" : "Customer List",
            icon: supplier ? Truck : Users,
          },
          {
            id: "new",
            label: supplier ? "Add Supplier" : "Add Customer",
            icon: Plus,
          },
          {
            id: "groups",
            label: supplier ? "Company / Brands" : "Customer Groups",
            icon: Boxes,
          },
          {
            id: "credit",
            label: supplier ? "Supplier Dues" : "Credit Customers",
            icon: CreditCard,
          },
          {
            id: "ledger",
            label: supplier ? "Supplier Ledger" : "Customer Ledger",
            icon: ClipboardList,
          },
        ]}
      />
      <div className="erp-stats">
        <StatCard
          label={supplier ? "Total Suppliers" : "Total Customers"}
          value={
            preview || !data
              ? "—"
              : String(supplier ? data.counts.suppliers : data.counts.customers)
          }
          icon={supplier ? Truck : Users}
        />
        <StatCard
          label={supplier ? "Active Suppliers" : "Active Customers"}
          value={
            preview || !data
              ? "—"
              : String(supplier ? data.counts.suppliers : data.counts.customers)
          }
          icon={UserRoundCheck}
          tone="blue"
        />
        <StatCard
          label={supplier ? "Outstanding Accounts" : "Credit Customers"}
          value="—"
          caption="অ্যাকাউন্ট লেজার যুক্ত হলে দেখাবে"
          icon={CreditCard}
          tone="orange"
        />
        <StatCard
          label={supplier ? "Total Payable" : "Total Receivable"}
          value={money(
            preview
              ? null
              : supplier
                ? data?.financials?.supplierDues
                : data?.financials?.customerDues,
          )}
          caption="সকল সময়ের বকেয়া"
          icon={ShieldCheck}
          tone="purple"
        />
        <StatCard
          label={supplier ? "Total Purchases" : "Total Sales (Selected Period)"}
          value={money(
            preview
              ? null
              : supplier
                ? data?.financials?.todayPurchases
                : data?.financials?.todaySales,
          )}
          icon={ShoppingCart}
        />
      </div>
      {current === "new" ? (
        <Panel title={supplier ? "নতুন সাপ্লায়ার" : "নতুন কাস্টমার"} icon={Users}>
          <div className="erp-form-body">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="নাম" required>
                <input
                  placeholder={supplier ? "সাপ্লায়ারের নাম" : "কাস্টমারের নাম"}
                />
              </Field>
              <Field label="মোবাইল নম্বর" required>
                <input type="tel" placeholder="01XXXXXXXXX" />
              </Field>
              <Field label={supplier ? "Company / Brand" : "Vehicle Type"}>
                <input placeholder={supplier ? "কোম্পানির নাম" : "গাড়ির ধরন"} />
              </Field>
              <Field label="ঠিকানা" className="md:col-span-3">
                <textarea placeholder="সম্পূর্ণ ঠিকানা লিখুন..." />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <DesignAction icon={Plus}>
                Save {supplier ? "Supplier" : "Customer"}
              </DesignAction>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <Panel className="mb-4">
            <ListFilters
              kind="customers"
              action={
                <DesignAction icon={Plus}>
                  {supplier ? "নতুন সাপ্লায়ার" : "নতুন কাস্টমার"}
                </DesignAction>
              }
            />
          </Panel>
          <div className="master-detail-layout">
            <Panel>
              <EmptyTable
                columns={
                  supplier
                    ? [
                        "#",
                        "সাপ্লায়ার কোড",
                        "কোম্পানি / নাম",
                        "মোবাইল নম্বর",
                        "ক্রয়",
                        "বকেয়া",
                        "স্ট্যাটাস",
                        "অ্যাকশন",
                      ]
                    : [
                        "#",
                        "কাস্টমার কোড",
                        "কাস্টমারের নাম",
                        "মোবাইল নম্বর",
                        "গ্রুপ",
                        "ক্রেডিট লিমিট",
                        "বকেয়া ব্যালেন্স",
                        "স্ট্যাটাস",
                        "অ্যাকশন",
                      ]
                }
                description={
                  supplier
                    ? "সাপ্লায়ারের প্রকৃত যোগাযোগ ও ক্রয়ের তথ্য এখানে দেখাবে।"
                    : "কাস্টমারের প্রকৃত যোগাযোগ, গাড়ি ও বকেয়ার তথ্য এখানে দেখাবে।"
                }
              />
              <Pager />
            </Panel>
            <DetailPanel
              title={supplier ? "সাপ্লায়ারের বিস্তারিত" : "কাস্টমার বিস্তারিত"}
              rows={[
                "নাম",
                "কোড",
                "মোবাইল",
                "গ্রুপ",
                "ক্রেডিট লিমিট",
                "বকেয়া",
                "স্থিতি",
              ]}
              footer={
                <DesignAction variant="outline" icon={ClipboardList}>
                  লেজার দেখুন
                </DesignAction>
              }
            />
          </div>
        </>
      )}
      <FoundationNote />
    </>
  );
}
