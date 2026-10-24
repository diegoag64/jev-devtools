// Ticket data, question wording and criteria adapted from the official cookbook.
// See provenance.json and LICENSE.typesafe. No measured responses are included.
export const recipe = {
  data: {
    customers: {
      "C-1042": {
        id: "C-1042",
        company: "Harbor Logistics",
      },
      "C-2210": {
        id: "C-2210",
        company: "Fernwood Studio",
      },
    },
    earlier_tickets: [
      {
        id: "T-101",
        customer_id: "C-1042",
        received_on: "2026-08-04",
        subject: "Adding an admin",
        text: "Hi, we run your self-hosted edition on Windows Server 2022 in our own data centre. How do I add a new admin user?",
      },
      {
        id: "T-102",
        customer_id: "C-2210",
        received_on: "2026-08-11",
        subject: "Exporting to PDF",
        text: "We're a small design studio on your cloud edition, paying monthly on the self-serve Team plan. How do I export a dashboard as a PDF?",
      },
      {
        id: "T-103",
        customer_id: "C-1042",
        received_on: "2026-08-19",
        subject: "Invoice download",
        text: "Sorry for the typos, typing this on my phone at the airport. Where can I download last month's invoice?",
      },
      {
        id: "T-104",
        customer_id: "C-2210",
        received_on: "2026-09-02",
        subject: "Dark mode?",
        text: "Our whole team is out on Friday for a public holiday, so no rush on this one. Is there a dark mode?",
      },
      {
        id: "T-105",
        customer_id: "C-1042",
        received_on: "2026-09-10",
        subject: "Sandbox environment",
        text: "For context, we signed an Enterprise contract with you in March. Can we get a sandbox environment for testing?",
      },
    ],
    later_messages: [
      {
        subject: "Slow dashboards",
        text: "Dashboards have been really slow since this morning.",
      },
      {
        subject: "Upgrade failing",
        text: "The upgrade to version 5.2 keeps failing halfway through.",
      },
      {
        subject: "More seats",
        text: "We'd like to add 20 more seats before next quarter.",
      },
    ],
    later_received_on: "2026-09-28",
    expected_team: {
      "C-1042": {
        "Slow dashboards": "selfhosted_windows",
        "Upgrade failing": "selfhosted_windows",
        "More seats": "enterprise_desk",
      },
      "C-2210": {
        "Slow dashboards": "cloud_ops",
        "Upgrade failing": "cloud_ops",
        "More seats": "billing",
      },
    },
  },
  route: {
    instructions: "Which support team should handle `ticket`?",
    criteria: {
      cloud_ops:
        "Cloud team: problems with the hosted cloud edition, run by us",
      selfhosted_linux:
        "Self-hosted team, Linux: installs, upgrades and performance of the self-hosted edition on Linux servers",
      selfhosted_windows:
        "Self-hosted team, Windows: installs, upgrades and performance of the self-hosted edition on Windows Server",
      billing:
        "Billing: invoices, payments, seats and plan changes for self-serve plans",
      enterprise_desk:
        "Enterprise desk: seats, contracts and account changes for customers on an Enterprise contract (their technical problems go to the technical teams)",
      general: "General product questions: features, how-to, settings",
      none_suitable: "None of these teams fits the ticket",
    },
  },
  gate: {
    instructions:
      "In `request.ticket`, does the thread state a lasting fact about the customer that should change how their future, unrelated tickets are handled? Count what the customer or our support staff wrote in `request.ticket`. `jev_answered` shows how the ticket was routed, which may rely on things learned earlier: do not count anything it says or implies.",
    criteria: {
      true: "Yes: in `request.ticket` the customer or our support staff state something about the customer that stays true after this ticket, such as the product edition or operating system they run, their plan or contract, or a standing preference.",
      false:
        "No: `request.ticket` only contains things specific to this one ticket or moment, such as a one-off request, today's schedule, or the device they happen to be typing on; or the lasting fact appears only in `jev_answered`.",
    },
  },
} as const;
