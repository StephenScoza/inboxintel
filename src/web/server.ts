import express from "express";
import { Category } from "@prisma/client";
import { prisma } from "../db";

function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleString();
}

function renderPage(title: string, body: string): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root {
          color-scheme: light;
          --bg: #f4efe6;
          --card: #fffaf2;
          --ink: #1f2937;
          --muted: #6b7280;
          --line: #d6c9b8;
          --accent: #a54b1a;
          --accent-soft: #f3d4b8;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Georgia, "Times New Roman", serif;
          background: radial-gradient(circle at top, #fff7eb 0%, var(--bg) 45%, #efe4d1 100%);
          color: var(--ink);
        }
        header {
          padding: 24px 28px 12px;
        }
        nav a {
          color: var(--accent);
          margin-right: 14px;
          text-decoration: none;
          font-weight: 700;
        }
        main {
          padding: 0 28px 28px;
        }
        .card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 20px;
          box-shadow: 0 10px 30px rgba(91, 53, 18, 0.08);
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
        }
        th, td {
          text-align: left;
          padding: 10px 8px;
          border-bottom: 1px solid var(--line);
          vertical-align: top;
        }
        th {
          color: var(--muted);
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .pill {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 999px;
          background: var(--accent-soft);
          color: #7a3310;
          font-size: 0.8rem;
          font-weight: 700;
        }
        form {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        input, select {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--line);
          background: white;
        }
        a { color: var(--accent); }
        pre {
          white-space: pre-wrap;
          background: #f8f2e9;
          border-radius: 12px;
          padding: 14px;
          border: 1px solid var(--line);
        }
        .grid {
          display: grid;
          gap: 18px;
        }
        .stats {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .stat {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 14px;
        }
      </style>
    </head>
    <body>
      <header>
        <h1>${escapeHtml(title)}</h1>
        <nav>
          <a href="/emails">Emails</a>
          <a href="/senders">Senders</a>
          <a href="/subscriptions">Subscriptions</a>
          <a href="/alerts">Alerts</a>
          <a href="/classifications">Classifications</a>
          <a href="/health">Health</a>
        </nav>
      </header>
      <main>
        <div class="card">${body}</div>
      </main>
    </body>
  </html>`;
}

export function createWebServer() {
  const app = express();

  app.get("/", (_req, res) => {
    res.redirect("/emails");
  });

  app.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });

  app.get("/oauth2callback", (_req, res) => {
    res.send(
      renderPage(
        "OAuth Callback",
        "<p>Google redirected successfully. Return to your terminal and paste the full URL if the Gmail auth helper is waiting for it.</p>"
      )
    );
  });

  app.get("/emails", async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const sender = typeof req.query.sender === "string" ? req.query.sender : undefined;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;

    const emails = await prisma.email.findMany({
      where: {
        senderEmail: sender ? { contains: sender, mode: "insensitive" } : undefined,
        receivedAt: from ? { gte: new Date(from) } : undefined,
        classification: category && category in Category ? { category: category as Category } : undefined
      },
      include: {
        sender: true,
        classification: true
      },
      orderBy: {
        receivedAt: "desc"
      },
      take: 100
    });

    const rows = emails
      .map((email) => {
        return `<tr>
          <td><a href="/emails/${email.id}">${escapeHtml(email.subject ?? "(no subject)")}</a></td>
          <td>${escapeHtml(email.senderEmail ?? email.senderRaw ?? "unknown")}</td>
          <td><span class="pill">${escapeHtml(email.classification?.category ?? "UNKNOWN")}</span></td>
          <td>${email.classification?.urgencyScore ?? 0}</td>
          <td>${email.classification?.opportunityScore ?? 0}</td>
          <td>${formatDate(email.receivedAt)}</td>
        </tr>`;
      })
      .join("");

    const html = `
      <form method="get">
        <select name="category">
          <option value="">All categories</option>
          ${Object.values(Category)
            .map((value) => `<option value="${value}" ${value === category ? "selected" : ""}>${value}</option>`)
            .join("")}
        </select>
        <input name="sender" placeholder="sender@example.com" value="${escapeHtml(sender)}" />
        <input name="from" type="date" value="${escapeHtml(from)}" />
        <button type="submit">Filter</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Sender</th>
            <th>Category</th>
            <th>Urgency</th>
            <th>Opportunity</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6">No emails yet.</td></tr>'}</tbody>
      </table>
    `;

    res.send(renderPage("InboxIntel Emails", html));
  });

  app.get("/emails/:id", async (req, res) => {
    const email = await prisma.email.findUnique({
      where: { id: req.params.id },
      include: {
        sender: true,
        links: true,
        classification: true,
        alerts: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!email) {
      res.status(404).send(renderPage("Email Not Found", "<p>Email not found.</p>"));
      return;
    }

    const linkItems = email.links
      .map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.url)}</a></li>`)
      .join("");

    const alertItems = email.alerts
      .map(
        (alert) =>
          `<li>${escapeHtml(alert.type)} | ${escapeHtml(alert.reason)} | ${formatDate(alert.createdAt)}</li>`
      )
      .join("");

    const body = `
      <div class="grid">
        <section>
          <p><strong>Subject:</strong> ${escapeHtml(email.subject ?? "(no subject)")}</p>
          <p><strong>Sender:</strong> ${escapeHtml(email.senderEmail ?? email.senderRaw ?? "unknown")}</p>
          <p><strong>Category:</strong> <span class="pill">${escapeHtml(email.classification?.category ?? "UNKNOWN")}</span></p>
          <p><strong>Received:</strong> ${formatDate(email.receivedAt)}</p>
          <p><strong>Labels:</strong> ${escapeHtml(email.gmailLabels.join(", ") || "none")}</p>
          <p><strong>Snippet:</strong> ${escapeHtml(email.snippet)}</p>
        </section>
        <section>
          <h3>Classification</h3>
          <p><strong>Confidence:</strong> ${email.classification?.confidence ?? 0}</p>
          <p><strong>Urgency Score:</strong> ${email.classification?.urgencyScore ?? 0}</p>
          <p><strong>Opportunity Score:</strong> ${email.classification?.opportunityScore ?? 0}</p>
          <p><strong>Reasons:</strong> ${escapeHtml(email.classification?.reasons.join(" | ") ?? "n/a")}</p>
        </section>
        <section>
          <h3>Extracted Intelligence</h3>
          <pre>${escapeHtml(
            JSON.stringify(
              {
                amounts: email.amountsJson,
                dates: email.datesJson,
                signals: email.classification?.signalsJson ?? null
              },
              null,
              2
            )
          )}</pre>
        </section>
        <section>
          <h3>Links</h3>
          <ul>${linkItems || "<li>No links extracted.</li>"}</ul>
        </section>
        <section>
          <h3>Alerts</h3>
          <ul>${alertItems || "<li>No alerts sent.</li>"}</ul>
        </section>
        <section>
          <h3>Plain Text Body</h3>
          <pre>${escapeHtml(email.plainTextBody ?? "No plain text body extracted.")}</pre>
        </section>
        <section>
          <h3>HTML Body Source</h3>
          <pre>${escapeHtml(email.htmlBody ?? "No HTML body extracted.")}</pre>
        </section>
      </div>
    `;

    res.send(renderPage(`Email ${email.subject ?? ""}`, body));
  });

  app.get("/senders", async (_req, res) => {
    const senders = await prisma.sender.findMany({
      include: {
        emails: {
          include: {
            classification: true
          }
        }
      },
      orderBy: {
        emailCount: "desc"
      },
      take: 100
    });

    const rows = senders
      .map((sender) => {
        const counts = new Map<string, number>();
        for (const email of sender.emails) {
          const category = email.classification?.category ?? "UNKNOWN";
          counts.set(category, (counts.get(category) ?? 0) + 1);
        }
        const dominantCategory =
          Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "UNKNOWN";

        return `<tr>
          <td>${escapeHtml(sender.name ?? "")}</td>
          <td>${escapeHtml(sender.email)}</td>
          <td>${escapeHtml(sender.domain)}</td>
          <td>${sender.emailCount}</td>
          <td><span class="pill">${escapeHtml(dominantCategory)}</span></td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "Senders",
        `<table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Domain</th>
              <th>Email Count</th>
              <th>Dominant Category</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5">No senders yet.</td></tr>'}</tbody>
        </table>`
      )
    );
  });

  app.get("/subscriptions", async (_req, res) => {
    const subscriptions = await prisma.subscription.findMany({
      include: {
        sender: true
      },
      orderBy: [
        { nextRenewalAt: "asc" },
        { updatedAt: "desc" }
      ],
      take: 100
    });

    const rows = subscriptions
      .map((subscription) => {
        return `<tr>
          <td>${escapeHtml(subscription.vendor)}</td>
          <td>${escapeHtml(subscription.sender?.email ?? "unknown")}</td>
          <td>${subscription.amount?.toString() ?? "n/a"}</td>
          <td>${formatDate(subscription.nextRenewalAt)}</td>
          <td>${escapeHtml(subscription.status)}</td>
          <td>${subscription.confidence}</td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "Subscriptions",
        `<table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Sender</th>
              <th>Amount</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6">No subscriptions yet.</td></tr>'}</tbody>
        </table>`
      )
    );
  });

  app.get("/alerts", async (_req, res) => {
    const alerts = await prisma.alert.findMany({
      include: {
        email: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    const rows = alerts
      .map((alert) => {
        return `<tr>
          <td>${escapeHtml(alert.type)}</td>
          <td>${escapeHtml(alert.category)}</td>
          <td><a href="/emails/${alert.emailId}">${escapeHtml(alert.email.subject ?? "(no subject)")}</a></td>
          <td>${escapeHtml(alert.reason)}</td>
          <td>${alert.urgencyScore}</td>
          <td>${alert.opportunityScore}</td>
          <td>${formatDate(alert.deliveredAt ?? alert.createdAt)}</td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "Alerts",
        `<table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Category</th>
              <th>Email</th>
              <th>Reason</th>
              <th>Urgency</th>
              <th>Opportunity</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7">No alerts yet.</td></tr>'}</tbody>
        </table>`
      )
    );
  });

  app.get("/classifications", async (_req, res) => {
    const classifications = await prisma.classification.groupBy({
      by: ["category"],
      _count: {
        category: true
      },
      _avg: {
        urgencyScore: true,
        opportunityScore: true,
        confidence: true
      },
      orderBy: {
        _count: {
          category: "desc"
        }
      }
    });

    const cards = classifications
      .map((item) => {
        return `<div class="stat">
          <strong>${escapeHtml(item.category)}</strong>
          <p>Emails: ${item._count.category}</p>
          <p>Avg urgency: ${Math.round(item._avg.urgencyScore ?? 0)}</p>
          <p>Avg opportunity: ${Math.round(item._avg.opportunityScore ?? 0)}</p>
          <p>Avg confidence: ${Math.round(item._avg.confidence ?? 0)}</p>
        </div>`;
      })
      .join("");

    res.send(renderPage("Classifications", `<div class="stats">${cards || "<p>No data yet.</p>"}</div>`));
  });

  return app;
}
