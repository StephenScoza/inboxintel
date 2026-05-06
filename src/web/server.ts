import express from "express";
import { Category } from "@prisma/client";
import { CATEGORY_METADATA, categoryCssClass, categoryFamily } from "../classifier/taxonomy";
import { prisma } from "../db";
import { buildSenderInsights } from "../intelligence/senderInsights";
import { buildSubscriptionInsights } from "../intelligence/subscriptionInsights";

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

function categoryClass(category: string | null | undefined): string {
  return categoryCssClass(category);
}

function renderCategoryPill(category: string | null | undefined): string {
  const value = category ?? "UNKNOWN";
  return `<span class="pill ${categoryClass(value)}">${escapeHtml(value)}</span>`;
}

function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "n/a";
  }

  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "n/a";
}

function renderHero(title: string, subtitle: string): string {
  return `
    <section class="hero">
      <div>
        <div class="eyebrow">InboxIntel</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="hero-mark">
        <div class="hero-icon">✉</div>
        <div>
          <strong>Know what matters.</strong>
          <span>Every email.</span>
        </div>
      </div>
    </section>
  `;
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
          color-scheme: dark;
          --bg: #0b0f1a;
          --panel: #111827;
          --panel-soft: #1a2335;
          --panel-strong: #0e1626;
          --line: rgba(148, 163, 184, 0.18);
          --ink: #f5f7fa;
          --muted: #94a3b8;
          --accent: #14b8a6;
          --accent-2: #3b82f6;
          --success: #22c55e;
          --danger: #ef4444;
          --warning: #f97316;
          --violet: #8b5cf6;
          --sky: #38bdf8;
          --slate: #6b7280;
          --white: #f5f7fa;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Inter, "Segoe UI", Helvetica, Arial, sans-serif;
          background:
            radial-gradient(circle at top left, rgba(20, 184, 166, 0.16), transparent 28%),
            radial-gradient(circle at top right, rgba(59, 130, 246, 0.18), transparent 34%),
            linear-gradient(180deg, #09101c 0%, #0b0f1a 100%);
          color: var(--ink);
        }
        header {
          padding: 24px 28px 16px;
          border-bottom: 1px solid var(--line);
          background: rgba(9, 16, 28, 0.82);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .brandbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 14px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .brand-lockup {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .brand-logo {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.28), rgba(20, 184, 166, 0.2));
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          font-size: 1.35rem;
        }
        .brand-title {
          font-size: 1.6rem;
          font-weight: 800;
          letter-spacing: -0.03em;
        }
        .brand-title .intel {
          color: var(--accent-2);
        }
        .brand-tagline {
          color: var(--muted);
          font-size: 0.92rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        nav a {
          color: var(--muted);
          margin-right: 10px;
          text-decoration: none;
          font-weight: 700;
          padding: 8px 12px;
          border-radius: 999px;
          transition: 140ms ease;
        }
        nav a:hover {
          color: var(--white);
          background: rgba(59, 130, 246, 0.12);
        }
        main {
          padding: 26px 28px 32px;
          max-width: 1480px;
          margin: 0 auto;
        }
        .card {
          background: linear-gradient(180deg, rgba(17, 24, 39, 0.98), rgba(13, 20, 35, 0.98));
          border: 1px solid var(--line);
          border-radius: 22px;
          padding: 22px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
        }
        .hero {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: end;
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--line);
        }
        .hero h1 {
          margin: 6px 0 8px;
          font-size: clamp(2rem, 3vw, 2.8rem);
          letter-spacing: -0.04em;
        }
        .hero p {
          margin: 0;
          max-width: 720px;
          color: var(--muted);
          font-size: 1rem;
        }
        .eyebrow {
          color: var(--accent);
          font-size: 0.84rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .hero-mark {
          min-width: 240px;
          padding: 18px 20px;
          border-radius: 18px;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.16), rgba(20, 184, 166, 0.12));
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          gap: 14px;
          align-items: center;
        }
        .hero-mark strong,
        .hero-mark span {
          display: block;
        }
        .hero-mark span {
          color: var(--muted);
          margin-top: 4px;
        }
        .hero-icon {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          background: rgba(11, 15, 26, 0.58);
          font-size: 1.3rem;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }
        .summary-card {
          background: linear-gradient(180deg, rgba(26, 35, 53, 0.94), rgba(13, 20, 35, 0.94));
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 16px;
        }
        .summary-label {
          color: var(--muted);
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .summary-value {
          margin-top: 8px;
          font-size: 1.8rem;
          font-weight: 800;
          letter-spacing: -0.04em;
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
        tbody tr:hover {
          background: rgba(59, 130, 246, 0.06);
        }
        .pill {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 999px;
          color: white;
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .category-free-trial { background: linear-gradient(135deg, #14b8a6, #0f766e); }
        .category-banking { background: linear-gradient(135deg, #0891b2, #155e75); }
        .category-bill-or-utility { background: linear-gradient(135deg, #f59e0b, #b45309); }
        .category-travel { background: linear-gradient(135deg, #0ea5e9, #0369a1); }
        .category-job-or-career { background: linear-gradient(135deg, #6366f1, #4338ca); }
        .category-healthcare { background: linear-gradient(135deg, #10b981, #047857); }
        .category-government { background: linear-gradient(135deg, #475569, #1e293b); }
        .category-education { background: linear-gradient(135deg, #a855f7, #7e22ce); }
        .category-shopping { background: linear-gradient(135deg, #14b8a6, #0d9488); }
        .category-failed-payment { background: linear-gradient(135deg, #ef4444, #b91c1c); }
        .category-renewal-notice { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
        .category-order-or-shipping { background: linear-gradient(135deg, #38bdf8, #0ea5e9); }
        .category-payment-receipt { background: linear-gradient(135deg, #22c55e, #15803d); }
        .category-retail-promo { background: linear-gradient(135deg, #6b7280, #475569); }
        .category-price-increase { background: linear-gradient(135deg, #f97316, #ea580c); }
        .category-raffle-or-giveaway { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
        .category-account-security { background: linear-gradient(135deg, #ef4444, #7f1d1d); }
        .category-subscription { background: linear-gradient(135deg, #14b8a6, #0f766e); }
        .category-personal { background: linear-gradient(135deg, #64748b, #475569); }
        .category-unknown { background: linear-gradient(135deg, #334155, #1e293b); }
        .score {
          font-weight: 800;
        }
        .score-high { color: var(--danger); }
        .score-medium { color: #f59e0b; }
        .score-low { color: var(--accent); }
        .section-title {
          margin: 0 0 10px;
          font-size: 1rem;
          letter-spacing: 0.02em;
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
          background: rgba(17, 24, 39, 0.95);
          color: var(--ink);
        }
        button {
          padding: 10px 14px;
          border-radius: 12px;
          border: 0;
          background: linear-gradient(135deg, var(--accent-2), #2563eb);
          color: white;
          font-weight: 800;
          cursor: pointer;
        }
        a { color: #7dd3fc; }
        pre {
          white-space: pre-wrap;
          background: rgba(8, 13, 24, 0.96);
          border-radius: 12px;
          padding: 14px;
          border: 1px solid var(--line);
          color: #dbe7f5;
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
          background: linear-gradient(180deg, rgba(26, 35, 53, 0.94), rgba(13, 20, 35, 0.94));
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 14px;
        }
        .muted {
          color: var(--muted);
        }
        ul {
          padding-left: 18px;
        }
        @media (max-width: 900px) {
          .hero {
            flex-direction: column;
            align-items: start;
          }
          .hero-mark {
            min-width: 0;
            width: 100%;
          }
          .brandbar {
            flex-direction: column;
            align-items: start;
          }
        }
      </style>
    </head>
    <body>
      <header>
        <div class="brandbar">
          <div class="brand">
            <div class="brand-logo">✉</div>
            <div class="brand-lockup">
              <div class="brand-title">Inbox<span class="intel">Intel</span></div>
              <div class="brand-tagline">Know what matters. Every email.</div>
            </div>
          </div>
        </div>
        <nav>
          <a href="/">Overview</a>
          <a href="/emails">Emails</a>
          <a href="/senders">Senders</a>
          <a href="/subscriptions">Subscriptions</a>
          <a href="/money-leaks">Money Leaks</a>
          <a href="/analytics">Analytics</a>
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

function scoreClass(score: number): string {
  if (score >= 75) {
    return "score-high";
  }

  if (score >= 45) {
    return "score-medium";
  }

  return "score-low";
}

export function createWebServer() {
  const app = express();

  app.get("/", async (_req, res) => {
    const [
      emailCount,
      senderCount,
      subscriptionCount,
      alertCount,
      urgentEmailCount,
      opportunityEmailCount,
      recentAlerts,
      upcomingRenewals,
      topSenders,
      highSignalEmails
    ] = await Promise.all([
      prisma.email.count(),
      prisma.sender.count(),
      prisma.subscription.count(),
      prisma.alert.count(),
      prisma.classification.count({
        where: {
          urgencyScore: { gte: 75 }
        }
      }),
      prisma.classification.count({
        where: {
          opportunityScore: { gte: 75 }
        }
      }),
      prisma.alert.findMany({
        include: { email: true },
        orderBy: { createdAt: "desc" },
        take: 6
      }),
      prisma.subscription.findMany({
        orderBy: [{ nextRenewalAt: "asc" }, { updatedAt: "desc" }],
        take: 6
      }),
      prisma.sender.findMany({
        include: {
          emails: {
            include: { classification: true },
            orderBy: { receivedAt: "desc" },
            take: 20
          }
        },
        orderBy: { emailCount: "desc" },
        take: 5
      }),
      prisma.email.findMany({
        include: { classification: true },
        where: {
          OR: [
            { classification: { urgencyScore: { gte: 75 } } },
            { classification: { opportunityScore: { gte: 75 } } }
          ]
        },
        orderBy: { receivedAt: "desc" },
        take: 8
      })
    ]);

    const alertItems = recentAlerts
      .map(
        (alert) =>
          `<li><a href="/emails/${alert.emailId}">${escapeHtml(alert.email.subject ?? "(no subject)")}</a> · ${escapeHtml(alert.type)} · ${escapeHtml(alert.reason)}</li>`
      )
      .join("");

    const renewalRows = upcomingRenewals
      .map(
        (subscription) => `<tr>
          <td>${escapeHtml(subscription.vendor)}</td>
          <td>${subscription.amount?.toString() ?? "n/a"}</td>
          <td>${formatDate(subscription.nextRenewalAt)}</td>
          <td>${renderCategoryPill(subscription.status)}</td>
        </tr>`
      )
      .join("");

    const senderRows = topSenders
      .map((sender) => {
        const insights = buildSenderInsights(sender.emails);
        return `<tr>
          <td><a href="/senders/${sender.id}">${escapeHtml(sender.name ?? sender.email)}</a></td>
          <td>${escapeHtml(sender.domain)}</td>
          <td>${sender.emailCount}</td>
          <td>${renderCategoryPill(insights.dominantCategory)}</td>
          <td><span class="score ${scoreClass(insights.maxUrgency)}">${insights.maxUrgency}</span></td>
        </tr>`;
      })
      .join("");

    const emailRows = highSignalEmails
      .map((email) => {
        const urgency = email.classification?.urgencyScore ?? 0;
        const opportunity = email.classification?.opportunityScore ?? 0;
        return `<tr>
          <td><a href="/emails/${email.id}">${escapeHtml(email.subject ?? "(no subject)")}</a></td>
          <td>${escapeHtml(email.senderEmail ?? email.senderRaw ?? "unknown")}</td>
          <td>${renderCategoryPill(email.classification?.category ?? "UNKNOWN")}</td>
          <td><span class="score ${scoreClass(urgency)}">${urgency}</span></td>
          <td><span class="score ${scoreClass(opportunity)}">${opportunity}</span></td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "InboxIntel Overview",
        `${renderHero("Inbox overview", "See urgent alerts, upcoming renewals, top recurring senders, and the most important signals across your mailbox in one place.")}
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Emails</div><div class="summary-value">${emailCount}</div></div>
          <div class="summary-card"><div class="summary-label">Senders</div><div class="summary-value">${senderCount}</div></div>
          <div class="summary-card"><div class="summary-label">Subscriptions</div><div class="summary-value">${subscriptionCount}</div></div>
          <div class="summary-card"><div class="summary-label">Alerts</div><div class="summary-value">${alertCount}</div></div>
          <div class="summary-card"><div class="summary-label">High Urgency</div><div class="summary-value">${urgentEmailCount}</div></div>
          <div class="summary-card"><div class="summary-label">High Opportunity</div><div class="summary-value">${opportunityEmailCount}</div></div>
        </section>
        <div class="grid">
          <section>
            <h3 class="section-title">Recent alerts</h3>
            <ul>${alertItems || "<li>No alerts yet.</li>"}</ul>
          </section>
          <section>
            <h3 class="section-title">Upcoming renewals</h3>
            <table>
              <thead><tr><th>Vendor</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead>
              <tbody>${renewalRows || '<tr><td colspan="4">No subscriptions yet.</td></tr>'}</tbody>
            </table>
          </section>
          <section>
            <h3 class="section-title">Top senders</h3>
            <table>
              <thead><tr><th>Sender</th><th>Domain</th><th>Emails</th><th>Dominant Category</th><th>Peak Urgency</th></tr></thead>
              <tbody>${senderRows || '<tr><td colspan="5">No senders yet.</td></tr>'}</tbody>
            </table>
          </section>
          <section>
            <h3 class="section-title">High-signal recent emails</h3>
            <table>
              <thead><tr><th>Subject</th><th>Sender</th><th>Category</th><th>Urgency</th><th>Opportunity</th></tr></thead>
              <tbody>${emailRows || '<tr><td colspan="5">No high-signal emails yet.</td></tr>'}</tbody>
            </table>
          </section>
        </div>`
      )
    );
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

    const summary = {
      total: emails.length,
      urgent: emails.filter((email) => (email.classification?.urgencyScore ?? 0) >= 75).length,
      opportunities: emails.filter((email) => (email.classification?.opportunityScore ?? 0) >= 75).length,
      trackedSenders: new Set(emails.map((email) => email.senderEmail).filter(Boolean)).size
    };

    const rows = emails
      .map((email) => {
        const urgency = email.classification?.urgencyScore ?? 0;
        const opportunity = email.classification?.opportunityScore ?? 0;
        return `<tr>
          <td><a href="/emails/${email.id}">${escapeHtml(email.subject ?? "(no subject)")}</a></td>
          <td>${escapeHtml(email.senderEmail ?? email.senderRaw ?? "unknown")}</td>
          <td>${renderCategoryPill(email.classification?.category ?? "UNKNOWN")}</td>
          <td><span class="score ${urgency >= 75 ? "score-high" : urgency >= 45 ? "score-medium" : "score-low"}">${urgency}</span></td>
          <td><span class="score ${opportunity >= 75 ? "score-high" : opportunity >= 45 ? "score-medium" : "score-low"}">${opportunity}</span></td>
          <td>${formatDate(email.receivedAt)}</td>
        </tr>`;
      })
      .join("");

    const html = `
      ${renderHero("Signal-first email intelligence", "Track renewals, price increases, failed payments, shipping events, and high-opportunity messages with a dark, alert-oriented workflow.")}
      <section class="summary-grid">
        <div class="summary-card"><div class="summary-label">Visible Emails</div><div class="summary-value">${summary.total}</div></div>
        <div class="summary-card"><div class="summary-label">High Urgency</div><div class="summary-value">${summary.urgent}</div></div>
        <div class="summary-card"><div class="summary-label">High Opportunity</div><div class="summary-value">${summary.opportunities}</div></div>
        <div class="summary-card"><div class="summary-label">Tracked Senders</div><div class="summary-value">${summary.trackedSenders}</div></div>
      </section>
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

    const techEmail = email as typeof email & {
      gmailHistoryId?: string | null;
      gmailSizeEstimate?: number | null;
      payloadMimeType?: string | null;
      payloadPartCount?: number | null;
      toHeader?: string | null;
      ccHeader?: string | null;
      bccHeader?: string | null;
      replyTo?: string | null;
      returnPath?: string | null;
      deliveredTo?: string | null;
      messageIdHeader?: string | null;
      inReplyTo?: string | null;
      referencesHeader?: string | null;
      listId?: string | null;
      listUnsubscribe?: string | null;
      listUnsubscribePost?: string | null;
      precedence?: string | null;
      autoSubmitted?: string | null;
      authenticationResults?: string | null;
      headersJson?: unknown;
      technicalFactsJson?: unknown;
    };

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
          <p><strong>Category:</strong> ${renderCategoryPill(email.classification?.category ?? "UNKNOWN")}</p>
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
          <h3>Technical Metadata</h3>
          <pre>${escapeHtml(
            JSON.stringify(
              {
                gmailHistoryId: techEmail.gmailHistoryId ?? null,
                gmailSizeEstimate: techEmail.gmailSizeEstimate ?? null,
                payloadMimeType: techEmail.payloadMimeType ?? null,
                payloadPartCount: techEmail.payloadPartCount ?? null,
                toHeader: techEmail.toHeader ?? null,
                ccHeader: techEmail.ccHeader ?? null,
                bccHeader: techEmail.bccHeader ?? null,
                replyTo: techEmail.replyTo ?? null,
                returnPath: techEmail.returnPath ?? null,
                deliveredTo: techEmail.deliveredTo ?? null,
                messageIdHeader: techEmail.messageIdHeader ?? null,
                inReplyTo: techEmail.inReplyTo ?? null,
                referencesHeader: techEmail.referencesHeader ?? null,
                listId: techEmail.listId ?? null,
                listUnsubscribe: techEmail.listUnsubscribe ?? null,
                listUnsubscribePost: techEmail.listUnsubscribePost ?? null,
                precedence: techEmail.precedence ?? null,
                autoSubmitted: techEmail.autoSubmitted ?? null,
                authenticationResults: techEmail.authenticationResults ?? null,
                headers: techEmail.headersJson ?? null,
                technicalFacts: techEmail.technicalFactsJson ?? null
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
          },
          orderBy: {
            receivedAt: "desc"
          },
          take: 25
        }
      },
      orderBy: {
        emailCount: "desc"
      },
      take: 100
    });

    const rows = senders
      .map((sender) => {
        const insights = buildSenderInsights(sender.emails);

        return `<tr>
          <td><a href="/senders/${sender.id}">${escapeHtml(sender.name ?? sender.email)}</a></td>
          <td>${escapeHtml(sender.email)}</td>
          <td>${escapeHtml(sender.domain)}</td>
          <td>${sender.emailCount}</td>
          <td>${renderCategoryPill(insights.dominantCategory)}</td>
          <td><span class="score ${scoreClass(insights.averageUrgency)}">${insights.averageUrgency}</span></td>
          <td><span class="score ${scoreClass(insights.averageOpportunity)}">${insights.averageOpportunity}</span></td>
          <td>${formatDate(insights.lastSeenAt)}</td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "Senders",
        `${renderHero("Sender intelligence", "See who appears most often, which domains dominate, and where each sender tends to land in your classification system.")}
        <table>
          <thead>
            <tr>
              <th>Sender</th>
              <th>Email</th>
              <th>Domain</th>
              <th>Email Count</th>
              <th>Dominant Category</th>
              <th>Avg Urgency</th>
              <th>Avg Opportunity</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8">No senders yet.</td></tr>'}</tbody>
        </table>`
      )
    );
  });

  app.get("/senders/:id", async (req, res) => {
    const sender = await prisma.sender.findUnique({
      where: { id: req.params.id },
      include: {
        subscriptions: {
          orderBy: [{ nextRenewalAt: "asc" }, { updatedAt: "desc" }]
        },
        emails: {
          include: {
            classification: true
          },
          orderBy: {
            receivedAt: "desc"
          },
          take: 50
        }
      }
    });

    if (!sender) {
      res.status(404).send(renderPage("Sender Not Found", "<p>Sender not found.</p>"));
      return;
    }

    const insights = buildSenderInsights(sender.emails);

    const subscriptionItems = sender.subscriptions
      .map(
        (subscription) => `<li>${escapeHtml(subscription.vendor)} · ${formatMoney(subscription.amount?.toString())} · ${formatDate(subscription.nextRenewalAt)} · ${renderCategoryPill(subscription.status)}</li>`
      )
      .join("");

    const emailRows = sender.emails
      .map((email) => {
        const urgency = email.classification?.urgencyScore ?? 0;
        const opportunity = email.classification?.opportunityScore ?? 0;
        return `<tr>
          <td><a href="/emails/${email.id}">${escapeHtml(email.subject ?? "(no subject)")}</a></td>
          <td>${renderCategoryPill(email.classification?.category ?? "UNKNOWN")}</td>
          <td><span class="score ${scoreClass(urgency)}">${urgency}</span></td>
          <td><span class="score ${scoreClass(opportunity)}">${opportunity}</span></td>
          <td>${formatDate(email.receivedAt)}</td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        `${sender.name ?? sender.email}`,
        `${renderHero("Sender profile", "Drill into one sender's classification history, peak risk, recurring subscriptions, and recent activity.")}
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Email Count</div><div class="summary-value">${sender.emailCount}</div></div>
          <div class="summary-card"><div class="summary-label">Dominant Category</div><div class="summary-value">${escapeHtml(insights.dominantCategory)}</div></div>
          <div class="summary-card"><div class="summary-label">Avg Urgency</div><div class="summary-value">${insights.averageUrgency}</div></div>
          <div class="summary-card"><div class="summary-label">Avg Opportunity</div><div class="summary-value">${insights.averageOpportunity}</div></div>
        </section>
        <div class="grid">
          <section>
            <h3 class="section-title">Sender details</h3>
            <p><strong>Name:</strong> ${escapeHtml(sender.name ?? "unknown")}</p>
            <p><strong>Email:</strong> ${escapeHtml(sender.email)}</p>
            <p><strong>Domain:</strong> ${escapeHtml(sender.domain)}</p>
            <p><strong>Last seen:</strong> ${formatDate(insights.lastSeenAt)}</p>
            <p><strong>Average confidence:</strong> ${insights.averageConfidence}</p>
          </section>
          <section>
            <h3 class="section-title">Tracked subscriptions</h3>
            <ul>${subscriptionItems || "<li>No subscriptions linked to this sender.</li>"}</ul>
          </section>
          <section>
            <h3 class="section-title">Recent email history</h3>
            <table>
              <thead><tr><th>Subject</th><th>Category</th><th>Urgency</th><th>Opportunity</th><th>Received</th></tr></thead>
              <tbody>${emailRows || '<tr><td colspan="5">No emails for this sender yet.</td></tr>'}</tbody>
            </table>
          </section>
        </div>`
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

    const decorated = subscriptions.map((subscription) => ({
      subscription,
      insights: buildSubscriptionInsights(subscription)
    }));

    const summary = {
      total: decorated.length,
      endingSoon: decorated.filter((entry) => entry.subscription.status === "ENDING_SOON").length,
      pastDue: decorated.filter((entry) => entry.subscription.status === "PAST_DUE").length,
      annualizedSpend: decorated.reduce((sum, entry) => sum + (entry.insights.annualizedCost ?? 0), 0)
    };

    const rows = decorated
      .sort((left, right) => {
        const riskDiff = right.insights.riskScore - left.insights.riskScore;
        if (riskDiff !== 0) {
          return riskDiff;
        }

        return right.insights.moneyLeakScore - left.insights.moneyLeakScore;
      })
      .map(({ subscription, insights }) => {
        return `<tr>
          <td>${escapeHtml(subscription.vendor)}</td>
          <td>${escapeHtml(subscription.sender?.email ?? "unknown")}</td>
          <td>${formatMoney(subscription.amount?.toString())}</td>
          <td>${formatMoney(insights.annualizedCost)}</td>
          <td>${formatDate(subscription.nextRenewalAt)}</td>
          <td>${renderCategoryPill(subscription.status)}</td>
          <td><span class="score ${scoreClass(insights.riskScore)}">${insights.riskScore}</span></td>
          <td><span class="score ${scoreClass(insights.moneyLeakScore)}">${insights.moneyLeakScore}</span></td>
          <td>${subscription.confidence}</td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "Subscriptions",
        `${renderHero("Subscription watchlist", "Track recurring vendors, renewal timing, and confidence so money-leak events surface before they become noise.")}
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Tracked Vendors</div><div class="summary-value">${summary.total}</div></div>
          <div class="summary-card"><div class="summary-label">Ending Soon</div><div class="summary-value">${summary.endingSoon}</div></div>
          <div class="summary-card"><div class="summary-label">Past Due</div><div class="summary-value">${summary.pastDue}</div></div>
          <div class="summary-card"><div class="summary-label">Annualized Spend</div><div class="summary-value">${formatMoney(summary.annualizedSpend)}</div></div>
        </section>
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Sender</th>
              <th>Monthly</th>
              <th>Annualized</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Leak</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8">No subscriptions yet.</td></tr>'}</tbody>
        </table>`
      )
    );
  });

  app.get("/money-leaks", async (_req, res) => {
    const subscriptions = await prisma.subscription.findMany({
      include: {
        sender: true
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 150
    });

    const ranked = subscriptions
      .map((subscription) => ({
        subscription,
        insights: buildSubscriptionInsights(subscription)
      }))
      .sort((left, right) => {
        const leakDiff = right.insights.moneyLeakScore - left.insights.moneyLeakScore;
        if (leakDiff !== 0) {
          return leakDiff;
        }

        const annualizedDiff = (right.insights.annualizedCost ?? 0) - (left.insights.annualizedCost ?? 0);
        if (annualizedDiff !== 0) {
          return annualizedDiff;
        }

        return right.insights.riskScore - left.insights.riskScore;
      });

    const summary = {
      highLeak: ranked.filter((entry) => entry.insights.moneyLeakScore >= 75).length,
      highRisk: ranked.filter((entry) => entry.insights.riskScore >= 75).length,
      annualizedSpend: ranked.reduce((sum, entry) => sum + (entry.insights.annualizedCost ?? 0), 0)
    };

    const rows = ranked
      .map(({ subscription, insights }) => {
        return `<tr>
          <td>${escapeHtml(subscription.vendor)}</td>
          <td>${renderCategoryPill(subscription.sourceCategory ?? "UNKNOWN")}</td>
          <td>${formatMoney(subscription.amount?.toString())}</td>
          <td>${formatMoney(insights.annualizedCost)}</td>
          <td>${formatDate(subscription.nextRenewalAt)}</td>
          <td><span class="score ${scoreClass(insights.moneyLeakScore)}">${insights.moneyLeakScore}</span></td>
          <td><span class="score ${scoreClass(insights.riskScore)}">${insights.riskScore}</span></td>
          <td>${escapeHtml(insights.reasons.join(" | ") || "No special risk markers")}</td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "Money Leaks",
        `${renderHero("Money leaks", "Rank subscriptions by recurring cost, failed-payment risk, price increases, and near-term renewals so expensive leaks stand out immediately.")}
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">High Leak Score</div><div class="summary-value">${summary.highLeak}</div></div>
          <div class="summary-card"><div class="summary-label">High Risk Score</div><div class="summary-value">${summary.highRisk}</div></div>
          <div class="summary-card"><div class="summary-label">Annualized Spend</div><div class="summary-value">${formatMoney(summary.annualizedSpend)}</div></div>
        </section>
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Source</th>
              <th>Monthly</th>
              <th>Annualized</th>
              <th>Due Date</th>
              <th>Leak Score</th>
              <th>Risk Score</th>
              <th>Reasons</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8">No subscription data yet.</td></tr>'}</tbody>
        </table>`
      )
    );
  });

  app.get("/analytics", async (_req, res) => {
    const [
      categoryBreakdown,
      topSenders,
      recentAlertBreakdown,
      urgentCount,
      opportunityCount,
      trackedEmailCount,
      listHeaderCount,
      authResultsCount,
      autoSubmittedCount,
      technicalAverages
    ] = await Promise.all([
      prisma.classification.groupBy({
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
      }),
      prisma.sender.findMany({
        include: {
          emails: {
            include: {
              classification: true
            },
            orderBy: {
              receivedAt: "desc"
            },
            take: 25
          }
        },
        orderBy: {
          emailCount: "desc"
        },
        take: 12
      }),
      prisma.alert.groupBy({
        by: ["type", "category"],
        _count: {
          type: true
        },
        orderBy: {
          _count: {
            type: "desc"
          }
        },
        take: 12
      }),
      prisma.classification.count({
        where: {
          urgencyScore: {
            gte: 75
          }
        }
      }),
      prisma.classification.count({
        where: {
          opportunityScore: {
            gte: 75
          }
        }
      }),
      prisma.email.count(),
      prisma.email.count({
        where: {
          listUnsubscribe: {
            not: null
          }
        }
      }),
      prisma.email.count({
        where: {
          authenticationResults: {
            not: null
          }
        }
      }),
      prisma.email.count({
        where: {
          autoSubmitted: {
            not: null
          }
        }
      }),
      prisma.email.aggregate({
        _avg: {
          payloadPartCount: true,
          gmailSizeEstimate: true
        }
      })
    ]);

    const categoryRows = categoryBreakdown
      .map(
        (entry) => `<tr>
          <td>${renderCategoryPill(entry.category)}</td>
          <td>${entry._count.category}</td>
          <td>${Math.round(entry._avg.urgencyScore ?? 0)}</td>
          <td>${Math.round(entry._avg.opportunityScore ?? 0)}</td>
          <td>${Math.round(entry._avg.confidence ?? 0)}</td>
        </tr>`
      )
      .join("");

    const familySummary = new Map<string, number>();
    for (const entry of categoryBreakdown) {
      const family = categoryFamily(entry.category);
      familySummary.set(family, (familySummary.get(family) ?? 0) + entry._count.category);
    }

    const familyCards = Array.from(familySummary.entries())
      .sort((left, right) => right[1] - left[1])
      .map(
        ([family, count]) => `<div class="stat">
          <strong>${escapeHtml(family)}</strong>
          <p>Emails: ${count}</p>
        </div>`
      )
      .join("");

    const senderRows = topSenders
      .map((sender) => {
        const insights = buildSenderInsights(sender.emails);
        return `<tr>
          <td><a href="/senders/${sender.id}">${escapeHtml(sender.name ?? sender.email)}</a></td>
          <td>${escapeHtml(sender.domain)}</td>
          <td>${sender.emailCount}</td>
          <td>${renderCategoryPill(insights.dominantCategory)}</td>
          <td>${insights.averageConfidence}</td>
        </tr>`;
      })
      .join("");

    const alertRows = recentAlertBreakdown
      .map(
        (entry) => `<tr>
          <td>${escapeHtml(entry.type)}</td>
          <td>${renderCategoryPill(entry.category)}</td>
          <td>${entry._count.type}</td>
        </tr>`
      )
      .join("");

    res.send(
      renderPage(
        "Analytics",
        `${renderHero("Mailbox analytics", "Inspect how InboxIntel is classifying the inbox, which senders dominate, and where urgency and opportunity are clustering after larger ingest runs.")}
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Tracked Categories</div><div class="summary-value">${categoryBreakdown.length}</div></div>
          <div class="summary-card"><div class="summary-label">High Urgency Emails</div><div class="summary-value">${urgentCount}</div></div>
          <div class="summary-card"><div class="summary-label">High Opportunity Emails</div><div class="summary-value">${opportunityCount}</div></div>
          <div class="summary-card"><div class="summary-label">Alert Signatures</div><div class="summary-value">${recentAlertBreakdown.length}</div></div>
        </section>
        <div class="grid">
          <section>
            <h3 class="section-title">Technical coverage</h3>
            <div class="stats">
              <div class="stat"><strong>Tracked emails</strong><p>${trackedEmailCount}</p></div>
              <div class="stat"><strong>List-Unsubscribe</strong><p>${listHeaderCount}</p></div>
              <div class="stat"><strong>Auth results</strong><p>${authResultsCount}</p></div>
              <div class="stat"><strong>Auto-submitted</strong><p>${autoSubmittedCount}</p></div>
              <div class="stat"><strong>Avg MIME parts</strong><p>${Math.round(technicalAverages._avg.payloadPartCount ?? 0)}</p></div>
              <div class="stat"><strong>Avg Gmail size</strong><p>${Math.round(technicalAverages._avg.gmailSizeEstimate ?? 0)} bytes</p></div>
            </div>
          </section>
          <section>
            <h3 class="section-title">Category families</h3>
            <div class="stats">${familyCards || "<p>No taxonomy data yet.</p>"}</div>
          </section>
          <section>
            <h3 class="section-title">Category distribution</h3>
            <table>
              <thead><tr><th>Category</th><th>Emails</th><th>Avg Urgency</th><th>Avg Opportunity</th><th>Avg Confidence</th></tr></thead>
              <tbody>${categoryRows || '<tr><td colspan="5">No classification data yet.</td></tr>'}</tbody>
            </table>
          </section>
          <section>
            <h3 class="section-title">Top senders</h3>
            <table>
              <thead><tr><th>Sender</th><th>Domain</th><th>Email Count</th><th>Dominant Category</th><th>Avg Confidence</th></tr></thead>
              <tbody>${senderRows || '<tr><td colspan="5">No sender data yet.</td></tr>'}</tbody>
            </table>
          </section>
          <section>
            <h3 class="section-title">Alert signatures</h3>
            <table>
              <thead><tr><th>Alert Type</th><th>Category</th><th>Count</th></tr></thead>
              <tbody>${alertRows || '<tr><td colspan="3">No alerts yet.</td></tr>'}</tbody>
            </table>
          </section>
        </div>`
      )
    );
  });

  app.get("/alerts", async (req, res) => {
    const windowDays = Math.max(1, Math.min(30, Number(req.query.windowDays) || 7));
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const alerts = await prisma.alert.findMany({
      include: {
        email: true
      },
      where: {
        createdAt: {
          gte: cutoff
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    const digestMap = new Map<string, { label: string; count: number; suppressed: number }>();
    let deliveredCount = 0;
    let suppressedCount = 0;

    for (const alert of alerts) {
      const key = `${alert.type}|${alert.category}`;
      const current = digestMap.get(key) ?? {
        label: `${alert.type} · ${alert.category}`,
        count: 0,
        suppressed: 0
      };
      current.count += 1;
      if (alert.webhookTarget === "suppressed") {
        current.suppressed += 1;
        suppressedCount += 1;
      } else {
        deliveredCount += 1;
      }
      digestMap.set(key, current);
    }

    const digestCards = Array.from(digestMap.values())
      .sort((left, right) => right.count - left.count)
      .map(
        (entry) => `<div class="stat">
          <strong>${escapeHtml(entry.label)}</strong>
          <p>Total: ${entry.count}</p>
          <p>Suppressed: ${entry.suppressed}</p>
          <p>Delivered: ${entry.count - entry.suppressed}</p>
        </div>`
      )
      .join("");

    const rows = alerts
      .map((alert) => {
        return `<tr>
          <td>${escapeHtml(alert.type)}</td>
          <td>${renderCategoryPill(alert.category)}</td>
          <td><a href="/emails/${alert.emailId}">${escapeHtml(alert.email.subject ?? "(no subject)")}</a></td>
          <td>${escapeHtml(alert.reason)}</td>
          <td>${alert.urgencyScore}</td>
          <td>${alert.opportunityScore}</td>
          <td>${escapeHtml(alert.webhookTarget ?? "unknown")}</td>
          <td>${formatDate(alert.deliveredAt ?? alert.createdAt)}</td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "Alerts",
        `${renderHero("Alert stream", "Review every alert-worthy event that hit the pipeline, including urgency, opportunity, suppression behavior, and a digest of recent alert volume.")}
        <form method="get">
          <select name="windowDays">
            ${[1, 3, 7, 14, 30]
              .map((value) => `<option value="${value}" ${value === windowDays ? "selected" : ""}>Last ${value} day${value === 1 ? "" : "s"}</option>`)
              .join("")}
          </select>
          <button type="submit">Update Window</button>
        </form>
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Recent Alerts</div><div class="summary-value">${alerts.length}</div></div>
          <div class="summary-card"><div class="summary-label">Delivered</div><div class="summary-value">${deliveredCount}</div></div>
          <div class="summary-card"><div class="summary-label">Suppressed</div><div class="summary-value">${suppressedCount}</div></div>
        </section>
        <section>
          <h3 class="section-title">Digest</h3>
          <div class="stats">${digestCards || "<p>No alerts in this window.</p>"}</div>
        </section>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Category</th>
              <th>Email</th>
              <th>Reason</th>
              <th>Urgency</th>
              <th>Opportunity</th>
              <th>Delivery</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8">No alerts yet.</td></tr>'}</tbody>
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
        const metadata = CATEGORY_METADATA[item.category];
        return `<div class="stat">
          <strong>${renderCategoryPill(item.category)}</strong>
          <p>${escapeHtml(metadata.description)}</p>
          <p>Family: ${escapeHtml(metadata.family)}</p>
          <p>Emails: ${item._count.category}</p>
          <p>Avg urgency: ${Math.round(item._avg.urgencyScore ?? 0)}</p>
          <p>Avg opportunity: ${Math.round(item._avg.opportunityScore ?? 0)}</p>
          <p>Avg confidence: ${Math.round(item._avg.confidence ?? 0)}</p>
        </div>`;
      })
      .join("");

    res.send(
      renderPage(
        "Classifications",
        `${renderHero("Category distribution", "Monitor how InboxIntel is classifying the mailbox and where confidence, urgency, and opportunity cluster across categories.")}
        <div class="stats">${cards || "<p>No data yet.</p>"}</div>`
      )
    );
  });

  return app;
}
