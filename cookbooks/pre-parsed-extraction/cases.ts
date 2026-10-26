// Recipe documents transcribed from the official TypeSafe cookbook (MIT).
const email = `From: Dana Whit <dana.whit@acme-corp.com>
To: billing@acme-corp.com
Cc: orders@acme-corp.com
Reply-To: dana.personal@gmail.com

Hi team - please don't use the billing alias for this one. Send my receipt to my
personal address instead. Thanks, Dana.`;
const phone = `Reach our San Francisco office at these numbers: main desk (415) 555-0199,
billing fax (415) 555-0142, and my direct cell (415) 555-0177. Call the cell if it's urgent.`;
const money = `Invoice INV-2087.
Subtotal: $1,200.00
Sales tax: $115.50
Total due: $1,315.50
A $50.00 courtesy credit from last month has already been applied.`;
export const extractionCases = {
  email: { label: "Email · receipt and sender", kind: "email", message: email },
  phone: { label: "Phone · mobile and country", kind: "phone", message: phone },
  money: { label: "Money · total and credit", kind: "money", message: money },
  boundary: {
    label: "Money · probabilities at and above 0.5",
    kind: "money",
    message: money,
  },
  below: {
    label: "Money · probability just below 0.5",
    kind: "money",
    message: money,
  },
  none: {
    label: "Money · no matching total or credit",
    kind: "money",
    message:
      "Reference price: $10.00. No invoice total or courtesy credit is stated.",
  },
  phoneNone: {
    label: "Phone · no mobile listed",
    kind: "phone",
    message:
      "San Francisco office main desk (415) 555-0199. No mobile number is listed.",
  },
  emailNone: {
    label: "Email · receipt address withheld",
    kind: "email",
    message:
      "From: DANA@example.com\nSend the receipt by post. DANA@example.com is the sender, not a receipt destination.",
  },
  empty: {
    label: "Empty candidates · no requests",
    kind: "money",
    message: "No amounts are listed in this document.",
  },
} as const;
export type ExtractionCase = keyof typeof extractionCases;
export type ExtractionKind = (typeof extractionCases)[ExtractionCase]["kind"];
export function isExtractionCase(value: unknown): value is ExtractionCase {
  return typeof value === "string" && Object.hasOwn(extractionCases, value);
}
