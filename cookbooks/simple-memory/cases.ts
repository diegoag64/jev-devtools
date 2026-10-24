import { recipe } from "./recipe.js";
export const memoryCases = {
  timeline: {
    label: "Full timeline · two customers, six comparisons",
    message:
      "Replay five earlier tickets, then compare three later messages for each customer with and without saved memory.",
  },
  boundary: {
    label: "Save at exactly 50%",
    message:
      "The Windows fact scores exactly 50% for remembering. Save it, then route a later dashboard ticket.",
  },
  below: {
    label: "Do not save at 49.9%",
    message:
      "The same Windows fact scores 49.9%. Leave memory empty and compare the later ticket.",
  },
  transient: {
    label: "Transient details · keep memory empty",
    message:
      "Replay only the airport and public-holiday tickets, then check that they did not create lasting memories.",
  },
} as const;
export type MemoryCase = keyof typeof memoryCases;
export const isMemoryCase = (value: unknown): value is MemoryCase =>
  typeof value === "string" && Object.hasOwn(memoryCases, value);
export type TicketState = {
  customer: { id: string; company: string };
  ticket: {
    id: string;
    received_on: string;
    subject: string;
    messages: { from: string; text: string }[];
  };
};
export type Entry = { state: TicketState; compare: boolean };
function ticket(
  customerId: keyof typeof recipe.data.customers,
  id: string,
  date: string,
  subject: string,
  text: string,
): TicketState {
  return {
    customer: { ...recipe.data.customers[customerId] },
    ticket: {
      id,
      received_on: date,
      subject,
      messages: [{ from: "customer", text }],
    },
  };
}
export function memoryTimeline(caseId: MemoryCase): Entry[] {
  const earlier = recipe.data.earlier_tickets.map((t) => ({
    state: ticket(t.customer_id, t.id, t.received_on, t.subject, t.text),
    compare: false,
  }));
  const later = (
    Object.keys(recipe.data.customers) as (keyof typeof recipe.data.customers)[]
  ).flatMap((cid, ci) =>
    recipe.data.later_messages.map((m, i) => ({
      state: ticket(
        cid,
        `T-${201 + ci * 3 + i}`,
        recipe.data.later_received_on,
        m.subject,
        m.text,
      ),
      compare: true,
    })),
  );
  if (caseId === "boundary" || caseId === "below")
    return [earlier[0], later[0]];
  if (caseId === "transient")
    return [earlier[2], earlier[3], later[0], later[5]];
  return [...earlier, ...later];
}
