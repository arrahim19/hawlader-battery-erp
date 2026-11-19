"use client";
import { useRef, useState } from "react";
import {
  Check,
  ClipboardList,
  CreditCard,
  FileText,
  List,
  Plus,
  Printer,
  Save,
  ScanLine,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import {
  DesignAction,
  EmptyTable,
  Field,
  FoundationNote,
  ModuleTabs,
  Pager,
  Panel,
  SummaryRows,
} from "@/components/reference-ui";
import { useBusinessDate } from "@/lib/use-business-date";
import { ListFilters } from "@/components/workspace/lists-view";

function PaymentPanel({ purchase }: { purchase: boolean }) {
  const [type, setType] = useState("full");
  return (
    <Panel
      title={purchase ? "Payment Information" : "Payment"}
      icon={CreditCard}
    >
      <div className="erp-form-body">
        {purchase ? (
          <fieldset className="mb-5">
            <legend className="mb-3 text-xs font-semibold">
              Payment Type <span className="text-red-500">*</span>
            </legend>
            <div className="erp-radio-group">
              {[
                ["full", "Full Payment"],
                ["partial", "Partial Payment"],
                ["due", "Due"],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="payment-type"
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="grid gap-4">
          <Field label="Paid Amount (৳)" required>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              disabled={type === "due"}
            />
          </Field>
          <Field label="Payment Method" required>
            <select defaultValue="CASH">
              <option value="CASH">Cash</option>
              <option value="BKASH">bKash</option>
              <option value="NAGAD">Nagad</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
        </div>
      </div>
    </Panel>
  );
}
function TransactionSummary({ purchase }: { purchase: boolean }) {
  return (
    <Panel>
      <h2 className="erp-summary-title">
        <ShoppingCart size={24} />
        {purchase ? "Purchase Summary" : "Sales Summary"}
      </h2>
      <SummaryRows
        rows={[
          ["Total Items", "0"],
          ["Total Quantity", "0"],
          ["Subtotal", "৳ 0.00"],
          ...(!purchase ? [["Discount", "৳ 0.00"] as [string, string]] : []),
          [purchase ? "Other Cost" : "Vat / Tax (0%)", "৳ 0.00"],
        ]}
      />
      <div className="erp-summary-total">
        <span>Grand Total</span>
        <span>৳ 0.00</span>
      </div>
    </Panel>
  );
}
export function TransactionView({
  purchase,
  preview,
  view = "",
}: {
  purchase: boolean;
  preview: boolean;
  view?: string;
}) {
  const today = useBusinessDate();
  const [saleType, setSaleType] = useState("cash");
  const form = useRef<HTMLFormElement>(null);
  const current = [
    "list",
    "pending",
    "payments",
    "returns",
    "reports",
  ].includes(view)
    ? view
    : "new";
  const moduleId = purchase ? "purchases" : "sales";
  const columns = purchase
    ? [
        "#",
        "Product",
        "Model Number",
        "Qty",
        "Unit Price (৳)",
        "Total (৳)",
        "Action",
      ]
    : [
        "#",
        "Product",
        "Model Number",
        "Qty",
        "Unit Price (৳)",
        "Discount (৳)",
        "Total (৳)",
        "Action",
      ];
  return (
    <>
      <ModuleTabs
        moduleId={moduleId}
        current={current}
        preview={preview}
        items={
          purchase
            ? [
                { id: "new", label: "New Purchase", icon: Plus },
                { id: "list", label: "Purchase List", icon: List },
                {
                  id: "pending",
                  label: "Pending Receive",
                  icon: ClipboardList,
                },
                { id: "payments", label: "Supplier Payments", icon: FileText },
              ]
            : [
                { id: "new", label: "New Sale", icon: ShoppingCart },
                { id: "list", label: "Sales List", icon: List },
              ]
        }
      />
      {current !== "new" ? (
        <Panel>
          <ListFilters kind={purchase ? "purchases" : "sales"} />
          <EmptyTable
            columns={
              purchase
                ? [
                    "ক্রয় নং",
                    "সাপ্লায়ার",
                    "তারিখ",
                    "মোট টাকা",
                    "গ্রহণের অবস্থা",
                    "বকেয়া",
                    "অ্যাকশন",
                  ]
                : [
                    "ইনভয়েস",
                    "তারিখ",
                    "কাস্টমার",
                    "মোট টাকা",
                    "পরিশোধ",
                    "বকেয়া",
                    "স্ট্যাটাস",
                    "অ্যাকশন",
                  ]
            }
            description={
              purchase
                ? "নিশ্চিত Purchase Receiving-এর পর প্রকৃত ক্রয়ের তথ্য দেখাবে।"
                : "নিশ্চিত বিক্রয় ও পেমেন্টের তথ্য এখানে দেখা যাবে।"
            }
          />
          <Pager />
        </Panel>
      ) : (
        <form ref={form} onSubmit={(event) => event.preventDefault()}>
          <div className="erp-form-grid">
            <div className="erp-form-main">
              <Panel title={purchase ? "New Purchase" : "New Sale (POS)"}>
                <div className="erp-form-body">
                  <div className="erp-form-top">
                    <div className="erp-inline-field">
                      <Field
                        label={purchase ? "Supplier" : "Customer"}
                        required
                      >
                        <select
                          aria-label={
                            purchase ? "Select supplier" : "Select customer"
                          }
                          defaultValue=""
                        >
                          <option value="">
                            {purchase
                              ? "সাপ্লায়ার নির্বাচন করুন"
                              : "কাস্টমার নির্বাচন করুন"}
                          </option>
                        </select>
                      </Field>
                      <DesignAction variant="outline" icon={Plus}>
                        {purchase ? "Add Supplier" : "New Customer"}
                      </DesignAction>
                    </div>
                    <Field
                      label={purchase ? "Purchase Date" : "Invoice Date"}
                      required
                    >
                      <input type="date" defaultValue={today} />
                    </Field>
                    <Field
                      label={purchase ? "Invoice / Challan No." : "Invoice No"}
                    >
                      <input
                        placeholder={
                          purchase
                            ? "কোম্পানির চালান নম্বর"
                            : "নিশ্চিত করার পর তৈরি হবে"
                        }
                        readOnly={!purchase}
                      />
                    </Field>
                    <div className="erp-field">
                      <span>{purchase ? "Status" : "Sales Type"}</span>
                      {purchase ? (
                        <span className="mt-1 w-fit rounded-md bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-800">
                          Draft
                        </span>
                      ) : (
                        <div className="erp-radio-group h-10">
                          {["cash", "credit"].map((value) => (
                            <label key={value}>
                              <input
                                type="radio"
                                name="sale-type"
                                value={value}
                                checked={saleType === value}
                                onChange={() => setSaleType(value)}
                              />
                              {value === "cash" ? "Cash" : "Credit"}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {purchase ? (
                    <>
                      <h3 className="erp-section-title">Add Products</h3>
                      <div className="erp-add-products">
                        <Field label="Product" required>
                          <select defaultValue="">
                            <option value="">পণ্য নির্বাচন করুন</option>
                          </select>
                        </Field>
                        <Field label="Qty" required>
                          <input type="number" min="1" defaultValue="1" />
                        </Field>
                        <Field label="Unit Purchase Price (৳)" required>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </Field>
                        <Field label="Total (৳)">
                          <input
                            value="0.00"
                            readOnly
                            className="bg-slate-100!"
                          />
                        </Field>
                        <DesignAction icon={Plus} feature="তালিকায় পণ্য যুক্ত করা">
                          Add to List
                        </DesignAction>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="erp-search mb-4">
                        <ScanLine size={21} />
                        <input
                          placeholder="পণ্যের নাম, কোড বা বারকোড দিয়ে খুঁজুন..."
                          aria-label="Search sale products"
                        />
                      </label>
                      <EmptyTable
                        columns={columns}
                        title="কোনো পণ্য নির্বাচন করা হয়নি"
                        description="বিদ্যমান পণ্য ও বিক্রয়যোগ্য ব্যাটারি ইউনিট বাছাই করলে এখানে দেখা যাবে।"
                      />
                      <div className="mt-4 flex gap-3">
                        <DesignAction
                          variant="outline"
                          icon={Plus}
                          feature="বিক্রয়ের পণ্য যুক্ত করা"
                        >
                          Add Row
                        </DesignAction>
                        <button
                          type="button"
                          className="erp-button inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4"
                          onClick={() => form.current?.reset()}
                        >
                          <Trash2 size={17} />
                          Clear All
                        </button>
                      </div>
                      <Field label="Remark (Optional)" className="mt-5">
                        <textarea placeholder="বিক্রয় সংক্রান্ত কোনো নোট..." />
                      </Field>
                    </>
                  )}
                </div>
              </Panel>
              {purchase ? (
                <Panel title="Purchase Items">
                  <EmptyTable
                    columns={columns}
                    title="কোনো পণ্য যুক্ত করা হয়নি"
                    description="তালিকায় নির্বাচিত পণ্য ও প্রতিটি ব্যাটারির পরিচিতি দেখা যাবে।"
                  />
                </Panel>
              ) : null}
            </div>
            <aside className="erp-form-side">
              <TransactionSummary purchase={purchase} />
              <PaymentPanel purchase={purchase} />
              {purchase ? (
                <Panel title="Notes (Optional)" icon={ClipboardList}>
                  <div className="erp-form-body">
                    <Field label="নোট" className="[&>span]:sr-only">
                      <textarea placeholder="যেকোনো নোট লিখুন..." />
                    </Field>
                  </div>
                </Panel>
              ) : (
                <Panel>
                  <div className="erp-summary-total mt-4! mb-4!">
                    <span>Due Amount</span>
                    <span>৳ 0.00</span>
                  </div>
                  <p className="px-5 pb-5 text-[10px] leading-5 text-slate-400">
                    এটি খালি cart-এর সারাংশ; কোনো বিক্রয় বা পেমেন্ট সংরক্ষিত হয়নি।
                  </p>
                </Panel>
              )}
            </aside>
          </div>
          <div className="erp-form-actions">
            {purchase ? (
              <button
                type="reset"
                className="erp-button inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5"
              >
                <X size={18} />
                Discard
              </button>
            ) : (
              <span />
            )}
            <div>
              {!purchase ? (
                <DesignAction variant="outline" icon={Printer}>
                  Print Invoice
                </DesignAction>
              ) : null}
              <DesignAction variant="outline" icon={Save}>
                Save as Draft
              </DesignAction>
              <DesignAction icon={Check}>
                {purchase ? "Receive & Confirm" : "Complete Sale"}
              </DesignAction>
            </div>
          </div>
        </form>
      )}
      <FoundationNote />
    </>
  );
}
