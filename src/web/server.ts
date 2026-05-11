import express from "express";
import { Category, Prisma } from "@prisma/client";
import { CATEGORY_METADATA, categoryCssClass, categoryFamily } from "../classifier/taxonomy";
import { config } from "../config";
import { prisma } from "../db";
import { buildMailingListInsights } from "../intelligence/mailingListInsights";
import { buildSenderInsights } from "../intelligence/senderInsights";
import { buildSubscriptionInsights } from "../intelligence/subscriptionInsights";

function visibleEmailWhere(base: Prisma.EmailWhereInput = {}): Prisma.EmailWhereInput {
  return {
    ...base,
    NOT: [
      { gmailLabels: { has: "SPAM" } },
      { gmailLabels: { has: "TRASH" } }
    ]
  };
}

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
        <div class="hero-icon">II</div>
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
        nav a.active {
          color: var(--white);
          background: rgba(20, 184, 166, 0.18);
          border: 1px solid rgba(20, 184, 166, 0.28);
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
        .category-paid-research-or-gig { background: linear-gradient(135deg, #f59e0b, #d97706); }
        .category-social-or-community { background: linear-gradient(135deg, #ec4899, #be185d); }
        .category-product-or-newsletter { background: linear-gradient(135deg, #06b6d4, #2563eb); }
        .category-sms-or-text { background: linear-gradient(135deg, #22c55e, #0f766e); }
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
        .chart-card {
          margin-top: 12px;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: rgba(8, 13, 24, 0.75);
          overflow-x: auto;
        }
        .chart-card svg {
          width: 100%;
          height: auto;
          display: block;
          min-width: 620px;
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
            <div class="brand-logo">II</div>
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
          <a href="/mailing-lists">Mailing Lists</a>
          <a href="/sync-runs">Sync Runs</a>
          <a href="/taxonomy-review">Taxonomy Review</a>
          <a href="/parse-issues">Parse Issues</a>
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

function formatPercent(value: number, total: number): string {
  if (!total) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function renderEmptyState(message: string): string {
  return `<p class="muted">${escapeHtml(message)}</p>`;
}

function renderHorizontalBarChart(
  items: Array<{ label: string; value: number; color?: string }>,
  options: { height?: number; maxValue?: number; valueFormatter?: (value: number) => string } = {}
): string {
  if (items.length === 0) {
    return renderEmptyState("No chart data yet.");
  }

  const barHeight = 24;
  const gap = 18;
  const width = 860;
  const leftPad = 170;
  const rightPad = 54;
  const innerWidth = width - leftPad - rightPad;
  const height = options.height ?? items.length * (barHeight + gap) + 10;
  const maxValue = options.maxValue ?? Math.max(...items.map((item) => item.value), 1);
  const valueFormatter = options.valueFormatter ?? ((value: number) => `${value}`);

  const rows = items
    .map((item, index) => {
      const y = index * (barHeight + gap) + 10;
      const barWidth = Math.max(4, Math.round((item.value / Math.max(maxValue, 1)) * innerWidth));
      const color = item.color ?? "url(#barGradient)";

      return `
        <text x="${leftPad - 12}" y="${y + 16}" text-anchor="end" fill="#cbd5e1" font-size="12" font-weight="700">${escapeHtml(item.label)}</text>
        <rect x="${leftPad}" y="${y}" width="${innerWidth}" height="${barHeight}" rx="10" fill="rgba(148, 163, 184, 0.12)" />
        <rect x="${leftPad}" y="${y}" width="${barWidth}" height="${barHeight}" rx="10" fill="${color}" />
        <text x="${leftPad + barWidth + 10}" y="${y + 16}" fill="#f5f7fa" font-size="12" font-weight="700">${escapeHtml(valueFormatter(item.value))}</text>
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">
      <defs>
        <linearGradient id="barGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#14b8a6" />
          <stop offset="100%" stop-color="#3b82f6" />
        </linearGradient>
      </defs>
      ${rows}
    </svg>
  `;
}

function renderLineChart(
  series: Array<{ label: string; values: number[]; color: string }>,
  labels: string[]
): string {
  if (labels.length === 0 || series.every((entry) => entry.values.every((value) => value === 0))) {
    return renderEmptyState("No timeline data yet.");
  }

  const width = 860;
  const height = 280;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 36;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const maxValue = Math.max(1, ...series.flatMap((entry) => entry.values));
  const stepX = labels.length > 1 ? innerWidth / (labels.length - 1) : innerWidth;

  const yFor = (value: number) => padTop + innerHeight - (value / maxValue) * innerHeight;

  const lines = series
    .map((entry) => {
      const points = entry.values
        .map((value, index) => `${padLeft + index * stepX},${yFor(value)}`)
        .join(" ");

      const pointDots = entry.values
        .map(
          (value, index) =>
            `<circle cx="${padLeft + index * stepX}" cy="${yFor(value)}" r="3.5" fill="${entry.color}" />`
        )
        .join("");

      return `<polyline fill="none" stroke="${entry.color}" stroke-width="3" points="${points}" />${pointDots}`;
    })
    .join("");

  const xLabels = labels
    .map((label, index) => {
      const x = padLeft + index * stepX;
      return `<text x="${x}" y="${height - 10}" text-anchor="middle" fill="#94a3b8" font-size="11">${escapeHtml(label)}</text>`;
    })
    .join("");

  const yTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const value = Math.round(maxValue * ratio);
      const y = yFor(value);
      return `
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="rgba(148, 163, 184, 0.14)" />
        <text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="11">${value}</text>
      `;
    })
    .join("");

  const legend = series
    .map(
      (entry, index) => `
        <rect x="${padLeft + index * 150}" y="0" width="12" height="12" rx="6" fill="${entry.color}" />
        <text x="${padLeft + index * 150 + 18}" y="11" fill="#cbd5e1" font-size="12" font-weight="700">${escapeHtml(entry.label)}</text>
      `
    )
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart">
      ${legend}
      ${yTicks}
      ${lines}
      ${xLabels}
    </svg>
  `;
}

function renderChartCard(title: string, subtitle: string, chartMarkup: string): string {
  return `
    <section>
      <h3 class="section-title">${escapeHtml(title)}</h3>
      <p class="muted">${escapeHtml(subtitle)}</p>
      <div class="chart-card">${chartMarkup}</div>
    </section>
  `;
}

export function createWebServer() {
  const app = express();

  app.get("/", async (req, res) => {
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : "";
    const accountFilter = accountId ? { gmailAccountId: accountId } : {};
    const visibleAccountFilter = visibleEmailWhere(accountFilter);
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
      highSignalEmails,
      gmailAccounts
    ] = await Promise.all([
      prisma.email.count({ where: visibleAccountFilter }),
      prisma.sender.count({
        where: accountId
          ? {
              emails: {
                some: {
                  ...visibleAccountFilter
                }
              }
            }
          : undefined
      }),
      prisma.subscription.count({ where: accountFilter }),
      prisma.alert.count({ where: accountFilter }),
      prisma.classification.count({
        where: {
          email: visibleAccountFilter,
          urgencyScore: { gte: 75 }
        }
      }),
      prisma.classification.count({
        where: {
          email: visibleAccountFilter,
          opportunityScore: { gte: 75 }
        }
      }),
      prisma.alert.findMany({
        include: { email: true },
        where: {
          ...(accountId ? { gmailAccountId: accountId } : {}),
          email: visibleEmailWhere()
        },
        orderBy: { createdAt: "desc" },
        take: 6
      }),
      prisma.subscription.findMany({
        where: accountFilter,
        orderBy: [{ nextRenewalAt: "asc" }, { updatedAt: "desc" }],
        take: 6
      }),
      prisma.sender.findMany({
        where: accountId
          ? {
              emails: {
                some: {
                  ...visibleAccountFilter
                }
              }
            }
          : undefined,
        include: {
          emails: {
            include: { classification: true },
            where: visibleAccountFilter,
            orderBy: { receivedAt: "desc" },
            take: 20
          }
        },
        orderBy: { emailCount: "desc" },
        take: 5
      }),
      prisma.email.findMany({
        include: { classification: true },
        where: visibleEmailWhere({
          ...accountFilter,
          OR: [
            { classification: { urgencyScore: { gte: 75 } } },
            { classification: { opportunityScore: { gte: 75 } } }
          ]
        }),
        orderBy: { receivedAt: "desc" },
        take: 8
      }),
      prisma.gmailAccount.findMany({
        orderBy: { updatedAt: "desc" },
        take: 10
      })
    ]);

    const selectedAccount = gmailAccounts.find((account) => account.id === accountId) ?? null;
    const latestSyncAt = selectedAccount?.lastSyncedAt ?? gmailAccounts[0]?.lastSyncedAt ?? null;
    const syncFreshnessMs = latestSyncAt ? Date.now() - latestSyncAt.getTime() : Number.POSITIVE_INFINITY;
    const syncStatus =
      syncFreshnessMs <= config.gmailPollIntervalMs * 2 ? "HEALTHY" :
      syncFreshnessMs <= config.gmailPollIntervalMs * 6 ? "LAGGING" :
      "IDLE";
    const scopeLabel = selectedAccount ? selectedAccount.email : "All Gmail accounts";

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
        <form method="get">
          <select name="accountId">
            <option value="">All Gmail accounts</option>
            ${gmailAccounts
              .map((account) => `<option value="${account.id}" ${account.id === accountId ? "selected" : ""}>${escapeHtml(account.email)}</option>`)
              .join("")}
          </select>
          <button type="submit">Update Scope</button>
        </form>
        <p class="muted">Scope: ${escapeHtml(scopeLabel)}</p>
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Emails</div><div class="summary-value">${emailCount}</div></div>
          <div class="summary-card"><div class="summary-label">Senders</div><div class="summary-value">${senderCount}</div></div>
          <div class="summary-card"><div class="summary-label">Subscriptions</div><div class="summary-value">${subscriptionCount}</div></div>
          <div class="summary-card"><div class="summary-label">Alerts</div><div class="summary-value">${alertCount}</div></div>
          <div class="summary-card"><div class="summary-label">High Urgency</div><div class="summary-value">${urgentEmailCount}</div></div>
          <div class="summary-card"><div class="summary-label">High Opportunity</div><div class="summary-value">${opportunityEmailCount}</div></div>
          <div class="summary-card"><div class="summary-label">Continuous Sync</div><div class="summary-value">${syncStatus}</div></div>
          <div class="summary-card"><div class="summary-label">Last Sync</div><div class="summary-value">${latestSyncAt ? formatDate(latestSyncAt) : "n/a"}</div></div>
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
      where: visibleEmailWhere({
        senderEmail: sender ? { contains: sender, mode: Prisma.QueryMode.insensitive } : undefined,
        receivedAt: from ? { gte: new Date(from) } : undefined,
        classification: category && category in Category ? { category: category as Category } : undefined
      }),
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

    if (email.gmailLabels.includes("SPAM") || email.gmailLabels.includes("TRASH")) {
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

  app.get("/mailing-lists", async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const minEmails = Math.max(1, Math.min(25, Number(req.query.minEmails) || 2));

    const emails = await prisma.email.findMany({
      where: {
        OR: [
          { listId: { not: null } },
          { listUnsubscribe: { not: null } }
        ]
      },
      select: {
        id: true,
        subject: true,
        senderEmail: true,
        senderName: true,
        senderDomain: true,
        listId: true,
        listUnsubscribe: true,
        listUnsubscribePost: true,
        receivedAt: true,
        classification: {
          select: {
            category: true,
            confidence: true,
            urgencyScore: true,
            opportunityScore: true
          }
        }
      },
      orderBy: {
        receivedAt: "desc"
      },
      take: 5000
    });

    const insights = buildMailingListInsights(emails)
      .filter((entry) => entry.emailCount >= minEmails)
      .filter((entry) => !category || entry.dominantCategory === category);

    const totalSubscriptions = insights.length;
    const oneClickCount = insights.filter((entry) => entry.oneClickSupported).length;
    const promoHeavyCount = insights.filter((entry) => entry.averageOpportunity >= 50).length;
    const uniqueTargets = Array.from(new Set(insights.flatMap((entry) => entry.unsubscribeTargets))).sort();

    const rows = insights
      .slice(0, 200)
      .map(
        (entry) => `<tr>
          <td>
            <strong>${escapeHtml(entry.label)}</strong><br />
            <span class="muted">${escapeHtml(entry.senderEmail ?? entry.senderDomain ?? "unknown")}</span>
          </td>
          <td>${renderCategoryPill(entry.dominantCategory)}</td>
          <td>${entry.emailCount}</td>
          <td>${entry.averageConfidence}</td>
          <td><span class="score ${scoreClass(entry.averageOpportunity)}">${entry.averageOpportunity}</span></td>
          <td>${entry.oneClickSupported ? "Yes" : "No"}</td>
          <td>${entry.unsubscribeTargets.length}</td>
          <td>${formatDate(entry.latestReceivedAt)}</td>
        </tr>`
      )
      .join("");

    const exportPreview = uniqueTargets
      .slice(0, 25)
      .map((target) => escapeHtml(target))
      .join("\n");

    res.send(
      renderPage(
        "Mailing Lists",
        `${renderHero("Mailing list intelligence", "Track the lists and newsletters your inbox is subscribed to, see which ones are noisy or high-opportunity, and surface unsubscribe targets without modifying Gmail.")}
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Tracked Lists</div><div class="summary-value">${totalSubscriptions}</div></div>
          <div class="summary-card"><div class="summary-label">One-Click Ready</div><div class="summary-value">${oneClickCount}</div></div>
          <div class="summary-card"><div class="summary-label">Promo Heavy</div><div class="summary-value">${promoHeavyCount}</div></div>
          <div class="summary-card"><div class="summary-label">Unique Targets</div><div class="summary-value">${uniqueTargets.length}</div></div>
        </section>
        <section>
          <h3 class="section-title">Safety note</h3>
          <p class="muted">InboxIntel V1 remains read-only. This page helps you audit mailing lists and gather unsubscribe endpoints, but it does not execute mass unsubscribe actions. Any future unsubscribe automation should require explicit manual approval.</p>
        </section>
        <form method="get">
          <select name="category">
            <option value="">All categories</option>
            ${Object.values(Category)
              .map((value) => `<option value="${value}" ${value === category ? "selected" : ""}>${value}</option>`)
              .join("")}
          </select>
          <select name="minEmails">
            ${[1, 2, 3, 5, 10].map((value) => `<option value="${value}" ${value === minEmails ? "selected" : ""}>${value}+ emails</option>`).join("")}
          </select>
          <button type="submit">Filter Lists</button>
        </form>
        <div class="grid">
          <section>
            <h3 class="section-title">Tracked mailing lists</h3>
            <table>
              <thead><tr><th>List</th><th>Dominant Category</th><th>Emails</th><th>Confidence</th><th>Opportunity</th><th>One-Click</th><th>Targets</th><th>Last Seen</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="8">No mailing lists matched this filter yet.</td></tr>'}</tbody>
            </table>
          </section>
          <section>
            <h3 class="section-title">Manual unsubscribe export</h3>
            <p class="muted">Use these targets for manual review or a future approval-based workflow. HTTP URLs and mailto targets are both preserved.</p>
            <pre>${exportPreview || "No unsubscribe targets detected yet."}</pre>
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

  app.get("/analytics", async (req, res) => {
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : "";
    const accountFilter = accountId ? { gmailAccountId: accountId } : {};
    const visibleAccountFilter = visibleEmailWhere(accountFilter);
    const timelineDays = 14;
    const timelineCutoff = new Date(Date.now() - timelineDays * 24 * 60 * 60 * 1000);

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
      technicalAverages,
      recentEmails,
      recentAlerts,
      mailingListEmails,
      gmailAccounts
    ] = await Promise.all([
      prisma.classification.groupBy({
        where: {
          email: visibleAccountFilter
        },
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
        where: accountId
          ? {
              emails: {
                some: {
                  ...visibleAccountFilter
                }
              }
            }
          : undefined,
        include: {
          emails: {
            include: {
              classification: true
            },
            where: visibleAccountFilter,
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
        where: accountFilter,
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
          email: visibleAccountFilter,
          urgencyScore: {
            gte: 75
          }
        }
      }),
      prisma.classification.count({
        where: {
          email: visibleAccountFilter,
          opportunityScore: {
            gte: 75
          }
        }
      }),
      prisma.email.count({
        where: visibleAccountFilter
      }),
      prisma.email.count({
        where: visibleEmailWhere({
          ...accountFilter,
          listUnsubscribe: {
            not: null
          }
        })
      }),
      prisma.email.count({
        where: visibleEmailWhere({
          ...accountFilter,
          authenticationResults: {
            not: null
          }
        })
      }),
      prisma.email.count({
        where: visibleEmailWhere({
          ...accountFilter,
          autoSubmitted: {
            not: null
          }
        })
      }),
      prisma.email.aggregate({
        where: visibleAccountFilter,
        _avg: {
          payloadPartCount: true,
          gmailSizeEstimate: true
        }
      }),
      prisma.email.findMany({
        where: visibleEmailWhere({
          ...accountFilter,
          receivedAt: {
            gte: timelineCutoff
          }
        }),
        select: {
          receivedAt: true,
          classification: {
            select: {
              urgencyScore: true,
              opportunityScore: true
            }
          }
        }
      }),
      prisma.alert.findMany({
        where: {
          ...(accountId ? { gmailAccountId: accountId } : {}),
          email: visibleEmailWhere(),
          createdAt: {
            gte: timelineCutoff
          }
        },
        select: {
          createdAt: true
        }
      }),
      prisma.email.findMany({
        where: visibleEmailWhere({
          ...accountFilter,
          OR: [
            { listId: { not: null } },
            { listUnsubscribe: { not: null } }
          ]
        }),
        select: {
          id: true,
          subject: true,
          senderEmail: true,
          senderName: true,
          senderDomain: true,
          listId: true,
          listUnsubscribe: true,
          listUnsubscribePost: true,
          receivedAt: true,
          classification: {
            select: {
              category: true,
              confidence: true,
              urgencyScore: true,
              opportunityScore: true
            }
          }
        },
        take: 5000
      }),
      prisma.gmailAccount.findMany({
        orderBy: {
          updatedAt: "desc"
        },
        take: 10
      })
    ]);

    const selectedAccount = gmailAccounts.find((account) => account.id === accountId) ?? null;

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
          <p class="muted">${formatPercent(count, trackedEmailCount)} of mailbox</p>
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

    const topCategoryChart = renderHorizontalBarChart(
      categoryBreakdown.slice(0, 8).map((entry) => ({
        label: entry.category.replaceAll("_", " "),
        value: entry._count.category
      })),
      {
        valueFormatter: (value) => `${formatCompactNumber(value)} emails`
      }
    );

    const familyChart = renderHorizontalBarChart(
      Array.from(familySummary.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([family, count]) => ({
          label: family,
          value: count
        })),
      {
        valueFormatter: (value) => `${formatPercent(value, trackedEmailCount)}`
      }
    );

    const timelineLabels = Array.from({ length: timelineDays }, (_, index) => {
      const date = new Date(timelineCutoff.getTime() + index * 24 * 60 * 60 * 1000);
      return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    });
    const timelineBuckets = timelineLabels.map(() => ({ emails: 0, urgent: 0, alerts: 0 }));

    const bucketIndexFor = (date: Date) => {
      const diff = date.getTime() - timelineCutoff.getTime();
      return Math.floor(diff / (24 * 60 * 60 * 1000));
    };

    for (const email of recentEmails) {
      if (!email.receivedAt) {
        continue;
      }

      const index = bucketIndexFor(email.receivedAt);
      if (index < 0 || index >= timelineBuckets.length) {
        continue;
      }

      timelineBuckets[index].emails += 1;
      if ((email.classification?.urgencyScore ?? 0) >= 75) {
        timelineBuckets[index].urgent += 1;
      }
    }

    for (const alert of recentAlerts) {
      const index = bucketIndexFor(alert.createdAt);
      if (index < 0 || index >= timelineBuckets.length) {
        continue;
      }
      timelineBuckets[index].alerts += 1;
    }

    const timelineChart = renderLineChart(
      [
        { label: "Emails", values: timelineBuckets.map((entry) => entry.emails), color: "#3b82f6" },
        { label: "Urgent", values: timelineBuckets.map((entry) => entry.urgent), color: "#ef4444" },
        { label: "Alerts", values: timelineBuckets.map((entry) => entry.alerts), color: "#14b8a6" }
      ],
      timelineLabels
    );

    const mailingListInsights = buildMailingListInsights(mailingListEmails);
    const mailingListChart = renderHorizontalBarChart(
      mailingListInsights.slice(0, 8).map((entry) => ({
        label: entry.label.length > 28 ? `${entry.label.slice(0, 28)}…` : entry.label,
        value: entry.emailCount
      })),
      {
        valueFormatter: (value) => `${value} msgs`
      }
    );

    const latestSyncAt = selectedAccount?.lastSyncedAt ?? gmailAccounts[0]?.lastSyncedAt ?? null;
    const syncFreshnessMs = latestSyncAt ? Date.now() - latestSyncAt.getTime() : Number.POSITIVE_INFINITY;
    const syncStatus =
      syncFreshnessMs <= config.gmailPollIntervalMs * 2 ? "HEALTHY" :
      syncFreshnessMs <= config.gmailPollIntervalMs * 6 ? "LAGGING" :
      "IDLE";
    const scopeLabel = selectedAccount ? selectedAccount.email : "All Gmail accounts";

    res.send(
      renderPage(
        "Analytics",
        `${renderHero("Mailbox analytics", "Inspect how InboxIntel is classifying the inbox, where mailing-list volume is clustering, and whether the continuous sync worker is keeping the local dataset fresh.")}
        <form method="get">
          <select name="accountId">
            <option value="">All Gmail accounts</option>
            ${gmailAccounts
              .map((account) => `<option value="${account.id}" ${account.id === accountId ? "selected" : ""}>${escapeHtml(account.email)}</option>`)
              .join("")}
          </select>
          <button type="submit">Update Scope</button>
        </form>
        <p class="muted">Scope: ${escapeHtml(scopeLabel)}</p>
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Tracked Categories</div><div class="summary-value">${categoryBreakdown.length}</div></div>
          <div class="summary-card"><div class="summary-label">High Urgency Emails</div><div class="summary-value">${urgentCount}</div></div>
          <div class="summary-card"><div class="summary-label">High Opportunity Emails</div><div class="summary-value">${opportunityCount}</div></div>
          <div class="summary-card"><div class="summary-label">Alert Signatures</div><div class="summary-value">${recentAlertBreakdown.length}</div></div>
          <div class="summary-card"><div class="summary-label">Sync Status</div><div class="summary-value">${syncStatus}</div></div>
          <div class="summary-card"><div class="summary-label">Last Sync</div><div class="summary-value">${latestSyncAt ? formatDate(latestSyncAt) : "n/a"}</div></div>
        </section>
        <div class="grid">
          ${renderChartCard("Volume timeline", `Last ${timelineDays} days of received email volume, urgent classifications, and generated alerts.`, timelineChart)}
          ${renderChartCard("Top categories", "Largest classification buckets in the current mailbox sample.", topCategoryChart)}
          ${renderChartCard("Category families", "How the taxonomy is balancing finance, commerce, life, work, engagement, and system-level email.", familyChart)}
          ${renderChartCard("Mailing list volume", "Top tracked mailing lists by message count, using List-Id and List-Unsubscribe headers where available.", mailingListChart)}
          <section>
            <h3 class="section-title">Technical coverage</h3>
            <div class="stats">
              <div class="stat"><strong>Tracked emails</strong><p>${trackedEmailCount}</p></div>
              <div class="stat"><strong>List-Unsubscribe</strong><p>${listHeaderCount}</p><p class="muted">${formatPercent(listHeaderCount, trackedEmailCount)}</p></div>
              <div class="stat"><strong>Auth results</strong><p>${authResultsCount}</p><p class="muted">${formatPercent(authResultsCount, trackedEmailCount)}</p></div>
              <div class="stat"><strong>Auto-submitted</strong><p>${autoSubmittedCount}</p></div>
              <div class="stat"><strong>Avg MIME parts</strong><p>${Math.round(technicalAverages._avg.payloadPartCount ?? 0)}</p></div>
              <div class="stat"><strong>Avg Gmail size</strong><p>${formatCompactNumber(Math.round(technicalAverages._avg.gmailSizeEstimate ?? 0))} bytes</p></div>
            </div>
          </section>
          <section>
            <h3 class="section-title">Category families</h3>
            <div class="stats">${familyCards || renderEmptyState("No taxonomy data yet.")}</div>
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

  app.get("/taxonomy-review", async (req, res) => {
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : "";
    const windowDays = Math.max(0, Math.min(365, Number(req.query.windowDays) || 0));
    const cutoff = windowDays > 0
      ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
      : null;

    const gmailAccounts = await prisma.gmailAccount.findMany({
      orderBy: {
        email: "asc"
      },
      select: {
        id: true,
        email: true
      }
    });

    const selectedAccount = gmailAccounts.find((account) => account.id === accountId) ?? null;

    const classifications = await prisma.classification.findMany({
      where: {
        email: {
          ...(accountId ? { gmailAccountId: accountId } : {}),
          ...(cutoff ? { receivedAt: { gte: cutoff } } : {})
        }
      },
      include: {
        email: {
          select: {
            id: true,
            subject: true,
            senderEmail: true,
            senderDomain: true,
            receivedAt: true,
            gmailAccount: {
              select: {
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 4000
    });

    const suspiciousReviews: Array<{
      emailId: string;
      subject: string | null;
      senderEmail: string | null;
      senderDomain: string | null;
      gmailAccountEmail: string | null;
      category: Category;
      confidence: number;
      urgencyScore: number;
      opportunityScore: number;
      reasons: string[];
      suspicionScore: number;
      suspicionReasons: string[];
    }> = [];

    const reviewByCategory = new Map<
      Category,
      {
        count: number;
        confidenceTotal: number;
        urgencyTotal: number;
        opportunityTotal: number;
        lowConfidenceCount: number;
        highUrgencyCount: number;
        sample: Array<{
          emailId: string;
          subject: string | null;
          senderEmail: string | null;
          senderDomain: string | null;
          gmailAccountEmail: string | null;
          reasons: string[];
          confidence: number;
        }>;
      }
    >();

    for (const classification of classifications) {
      const current = reviewByCategory.get(classification.category) ?? {
        count: 0,
        confidenceTotal: 0,
        urgencyTotal: 0,
        opportunityTotal: 0,
        lowConfidenceCount: 0,
        highUrgencyCount: 0,
        sample: []
      };

      current.count += 1;
      current.confidenceTotal += classification.confidence;
      current.urgencyTotal += classification.urgencyScore;
      current.opportunityTotal += classification.opportunityScore;
      if (classification.confidence < 70) {
        current.lowConfidenceCount += 1;
      }
      if (classification.urgencyScore >= 75) {
        current.highUrgencyCount += 1;
      }
      if (current.sample.length < 3) {
        current.sample.push({
          emailId: classification.email.id,
          subject: classification.email.subject,
          senderEmail: classification.email.senderEmail,
          senderDomain: classification.email.senderDomain,
          gmailAccountEmail: classification.email.gmailAccount?.email ?? null,
          reasons: classification.reasons.slice(0, 3),
          confidence: classification.confidence
        });
      }

      reviewByCategory.set(classification.category, current);

      const suspicionReasons: string[] = [];
      const signals = typeof classification.signalsJson === "object" && classification.signalsJson
        ? (classification.signalsJson as Record<string, unknown>)
        : {};
      const likelyMarketing = signals.likelyMarketing === true;
      const likelyTransactional = signals.likelyTransactional === true;
      const family = CATEGORY_METADATA[classification.category].family;
      let suspicionScore = 0;

      if (classification.confidence < 72) {
        suspicionScore += 35 + (72 - classification.confidence);
        suspicionReasons.push(`Low confidence ${classification.confidence}`);
      }

      if (classification.category === Category.UNKNOWN) {
        suspicionScore += 28;
        suspicionReasons.push("Unknown bucket needs taxonomy decision");
      }

      if (likelyMarketing && ["FINANCE", "LIFE", "WORK"].includes(family)) {
        suspicionScore += 24;
        suspicionReasons.push("Marketing-style email in non-marketing family");
      }

      if (likelyTransactional && ["RETAIL_PROMO", "SHOPPING", "PRODUCT_OR_NEWSLETTER"].includes(classification.category)) {
        suspicionScore += 22;
        suspicionReasons.push("Transactional-style email in promo/newsletter bucket");
      }

      if (classification.urgencyScore >= 70 && classification.confidence < 80) {
        suspicionScore += 12;
        suspicionReasons.push("High urgency with weaker confidence");
      }

      if (classification.opportunityScore >= 70 && classification.confidence < 80) {
        suspicionScore += 10;
        suspicionReasons.push("High opportunity with weaker confidence");
      }

      if (suspicionScore > 0) {
        suspiciousReviews.push({
          emailId: classification.email.id,
          subject: classification.email.subject,
          senderEmail: classification.email.senderEmail,
          senderDomain: classification.email.senderDomain,
          gmailAccountEmail: classification.email.gmailAccount?.email ?? null,
          category: classification.category,
          confidence: classification.confidence,
          urgencyScore: classification.urgencyScore,
          opportunityScore: classification.opportunityScore,
          reasons: classification.reasons.slice(0, 3),
          suspicionScore,
          suspicionReasons
        });
      }
    }

    const categoryRows = Object.values(Category)
      .map((category) => {
        const entry = reviewByCategory.get(category) ?? {
          count: 0,
          confidenceTotal: 0,
          urgencyTotal: 0,
          opportunityTotal: 0,
          lowConfidenceCount: 0,
          highUrgencyCount: 0,
          sample: []
        };

        const avgConfidence = entry.count ? Math.round(entry.confidenceTotal / entry.count) : 0;
        const avgUrgency = entry.count ? Math.round(entry.urgencyTotal / entry.count) : 0;
        const avgOpportunity = entry.count ? Math.round(entry.opportunityTotal / entry.count) : 0;
        const sampleMarkup = entry.sample.length
          ? `<ul>${entry.sample
              .map(
                (sample) =>
                  `<li><a href="/emails/${sample.emailId}">${escapeHtml(sample.subject ?? "(no subject)")}</a> · ${escapeHtml(sample.senderEmail ?? sample.senderDomain ?? "unknown")} · conf ${sample.confidence}<br /><span class="muted">${escapeHtml(sample.reasons.join(" | "))}</span></li>`
              )
              .join("")}</ul>`
          : renderEmptyState("No sampled emails.");

        return `<tr>
          <td>${renderCategoryPill(category)}</td>
          <td>${CATEGORY_METADATA[category].family}</td>
          <td>${entry.count}</td>
          <td>${avgConfidence}</td>
          <td>${avgUrgency}</td>
          <td>${avgOpportunity}</td>
          <td>${entry.lowConfidenceCount}</td>
          <td>${entry.highUrgencyCount}</td>
          <td>${sampleMarkup}</td>
        </tr>`;
      })
      .join("");

    const lowConfidenceChart = renderHorizontalBarChart(
      Object.values(Category)
        .map((category) => {
          const entry = reviewByCategory.get(category);
          return {
            label: category.replaceAll("_", " "),
            value: entry?.lowConfidenceCount ?? 0
          };
        })
        .filter((entry) => entry.value > 0)
        .sort((left, right) => right.value - left.value)
        .slice(0, 10),
      {
        valueFormatter: (value) => `${value} low-conf`
      }
    );

    const confidenceChart = renderHorizontalBarChart(
      Object.values(Category)
        .map((category) => {
          const entry = reviewByCategory.get(category);
          const count = entry?.count ?? 0;
          return {
            label: category.replaceAll("_", " "),
            value: count ? Math.round(entry!.confidenceTotal / count) : 0
          };
        })
        .filter((entry) => entry.value > 0)
        .sort((left, right) => right.value - left.value),
      {
        maxValue: 100,
        valueFormatter: (value) => `${value}/100`
      }
    );

    const totalClassified = classifications.length;
    const lowConfidenceTotal = classifications.filter((entry) => entry.confidence < 70).length;
    const urgentTotal = classifications.filter((entry) => entry.urgencyScore >= 75).length;
    const suspiciousQueue = suspiciousReviews
      .sort((left, right) => {
        if (right.suspicionScore !== left.suspicionScore) {
          return right.suspicionScore - left.suspicionScore;
        }

        return left.confidence - right.confidence;
      })
      .slice(0, 30);

    const unknownQueue = suspiciousReviews
      .filter((entry) => entry.category === Category.UNKNOWN)
      .sort((left, right) => {
        if (right.suspicionScore !== left.suspicionScore) {
          return right.suspicionScore - left.suspicionScore;
        }

        return left.confidence - right.confidence;
      })
      .slice(0, 12);

    const suspiciousClusterMap = new Map<string, {
      senderLabel: string;
      senderDomain: string | null;
      category: Category;
      count: number;
      confidenceTotal: number;
      suspicionTotal: number;
      topReasons: Map<string, number>;
      sampleEmailId: string;
      sampleSubject: string | null;
    }>();

    for (const entry of suspiciousReviews) {
      const senderLabel = entry.senderDomain ?? entry.senderEmail ?? "unknown";
      const clusterKey = `${senderLabel}|${entry.category}`;
      const current = suspiciousClusterMap.get(clusterKey) ?? {
        senderLabel,
        senderDomain: entry.senderDomain,
        category: entry.category,
        count: 0,
        confidenceTotal: 0,
        suspicionTotal: 0,
        topReasons: new Map<string, number>(),
        sampleEmailId: entry.emailId,
        sampleSubject: entry.subject
      };

      current.count += 1;
      current.confidenceTotal += entry.confidence;
      current.suspicionTotal += entry.suspicionScore;
      for (const reason of entry.suspicionReasons) {
        current.topReasons.set(reason, (current.topReasons.get(reason) ?? 0) + 1);
      }

      suspiciousClusterMap.set(clusterKey, current);
    }

    const suspiciousClusters = Array.from(suspiciousClusterMap.values())
      .filter((entry) => entry.count >= 2)
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }

        return right.suspicionTotal - left.suspicionTotal;
      })
      .slice(0, 12);

    const suspiciousRows = suspiciousQueue
      .map(
        (entry) => `<tr>
          <td><a href="/emails/${entry.emailId}">${escapeHtml(entry.subject ?? "(no subject)")}</a></td>
          <td>${escapeHtml(entry.senderEmail ?? entry.senderDomain ?? "unknown")}</td>
          <td>${escapeHtml(entry.gmailAccountEmail ?? "n/a")}</td>
          <td>${renderCategoryPill(entry.category)}</td>
          <td>${entry.confidence}</td>
          <td>${entry.urgencyScore}</td>
          <td>${entry.opportunityScore}</td>
          <td>${entry.suspicionScore}</td>
          <td><span class="muted">${escapeHtml(entry.suspicionReasons.join(" | "))}</span><br/>${escapeHtml(entry.reasons.join(" | "))}</td>
        </tr>`
      )
      .join("");

    const unknownRows = unknownQueue
      .map(
        (entry) => `<tr>
          <td><a href="/emails/${entry.emailId}">${escapeHtml(entry.subject ?? "(no subject)")}</a></td>
          <td>${escapeHtml(entry.senderEmail ?? entry.senderDomain ?? "unknown")}</td>
          <td>${escapeHtml(entry.gmailAccountEmail ?? "n/a")}</td>
          <td>${entry.confidence}</td>
          <td>${entry.opportunityScore}</td>
          <td><span class="muted">${escapeHtml(entry.suspicionReasons.join(" | "))}</span><br/>${escapeHtml(entry.reasons.join(" | "))}</td>
        </tr>`
      )
      .join("");

    const clusterRows = suspiciousClusters
      .map((entry) => {
        const avgConfidence = Math.round(entry.confidenceTotal / Math.max(entry.count, 1));
        const topReasons = Array.from(entry.topReasons.entries())
          .sort((left, right) => right[1] - left[1])
          .slice(0, 3)
          .map(([reason, count]) => `${reason} (${count})`)
          .join(" | ");

        return `<tr>
          <td>${escapeHtml(entry.senderLabel)}</td>
          <td>${renderCategoryPill(entry.category)}</td>
          <td>${entry.count}</td>
          <td>${avgConfidence}</td>
          <td>${Math.round(entry.suspicionTotal / Math.max(entry.count, 1))}</td>
          <td><a href="/emails/${entry.sampleEmailId}">${escapeHtml(entry.sampleSubject ?? "(no subject)")}</a></td>
          <td>${escapeHtml(topReasons || "No repeated reason")}</td>
        </tr>`;
      })
      .join("");

    const suspiciousCategoryChart = renderHorizontalBarChart(
      Array.from(
        suspiciousQueue.reduce((map, entry) => {
          map.set(entry.category, (map.get(entry.category) ?? 0) + 1);
          return map;
        }, new Map<Category, number>())
      ).map(([category, count]) => ({
        label: category.replaceAll("_", " "),
        value: count
      })),
      {
        valueFormatter: (value) => `${value} flagged`
      }
    );

    const suspiciousClusterChart = renderHorizontalBarChart(
      suspiciousClusters.map((entry) => ({
        label: `${entry.senderLabel} → ${entry.category.replaceAll("_", " ")}`,
        value: entry.count
      })),
      {
        valueFormatter: (value) => `${value} emails`
      }
    );

    const unknownByDomainChart = renderHorizontalBarChart(
      Array.from(
        unknownQueue.reduce((map, entry) => {
          const key = entry.senderDomain ?? entry.senderEmail ?? "unknown";
          map.set(key, (map.get(key) ?? 0) + 1);
          return map;
        }, new Map<string, number>())
      )
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 10),
      {
        valueFormatter: (value) => `${value} unknown`
      }
    );

    const unknownCount = suspiciousReviews.filter((entry) => entry.category === Category.UNKNOWN).length;
    const marketingMismatchCount = suspiciousReviews.filter((entry) =>
      entry.suspicionReasons.includes("Marketing-style email in non-marketing family")
    ).length;
    const transactionalMismatchCount = suspiciousReviews.filter((entry) =>
      entry.suspicionReasons.includes("Transactional-style email in promo/newsletter bucket")
    ).length;
    const scopedSubtitleParts = [
      selectedAccount ? `Account: ${selectedAccount.email}` : "Account: all tracked Gmail accounts",
      cutoff ? `Window: last ${windowDays} day${windowDays === 1 ? "" : "s"}` : "Window: all time"
    ];

    res.send(
      renderPage(
        "Taxonomy Review",
        `${renderHero("Taxonomy review", "Audit every category as a system. See where confidence is weak, which buckets carry the most edge cases, and inspect real examples with the rule reasons that put them there.")}
        <form method="get">
          <select name="accountId">
            <option value="">All Gmail accounts</option>
            ${gmailAccounts
              .map((account) => `<option value="${account.id}" ${account.id === accountId ? "selected" : ""}>${escapeHtml(account.email)}</option>`)
              .join("")}
          </select>
          <select name="windowDays">
            ${[
              { value: 0, label: "All time" },
              { value: 7, label: "Last 7 days" },
              { value: 14, label: "Last 14 days" },
              { value: 30, label: "Last 30 days" },
              { value: 90, label: "Last 90 days" }
            ]
              .map((option) => `<option value="${option.value}" ${option.value === windowDays ? "selected" : ""}>${option.label}</option>`)
              .join("")}
          </select>
          <button type="submit">Update Scope</button>
        </form>
        <p class="muted">${escapeHtml(scopedSubtitleParts.join(" · "))}</p>
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Classified Emails</div><div class="summary-value">${totalClassified}</div></div>
          <div class="summary-card"><div class="summary-label">Taxonomy Buckets</div><div class="summary-value">${Object.values(Category).length}</div></div>
          <div class="summary-card"><div class="summary-label">Low Confidence</div><div class="summary-value">${lowConfidenceTotal}</div></div>
          <div class="summary-card"><div class="summary-label">High Urgency</div><div class="summary-value">${urgentTotal}</div></div>
          <div class="summary-card"><div class="summary-label">Review Queue</div><div class="summary-value">${suspiciousQueue.length}</div></div>
          <div class="summary-card"><div class="summary-label">Unknown Left</div><div class="summary-value">${unknownCount}</div></div>
          <div class="summary-card"><div class="summary-label">Marketing Mismatch</div><div class="summary-value">${marketingMismatchCount}</div></div>
          <div class="summary-card"><div class="summary-label">Transactional Mismatch</div><div class="summary-value">${transactionalMismatchCount}</div></div>
        </section>
        <div class="grid">
          ${renderChartCard("Low-confidence hotspots", "Categories with the most emails scoring below 70 confidence are usually the best candidates for the next rule pass.", lowConfidenceChart)}
          ${renderChartCard("Average confidence by category", "A quick precision view across the whole taxonomy.", confidenceChart)}
          ${renderChartCard("Flagged review queue", "These are the categories currently surfacing the most suspicious classifications in the review queue below.", suspiciousCategoryChart)}
          ${renderChartCard("Review clusters", "Repeated suspicious patterns are where a single rule change can clean up many emails at once.", suspiciousClusterChart)}
          ${renderChartCard("Unknown cluster by sender", "The remaining unknown set is now small enough to treat like a focused backlog.", unknownByDomainChart)}
          <section>
            <h3 class="section-title">Unknown emails to classify next</h3>
            <table>
              <thead><tr><th>Email</th><th>Sender</th><th>Account</th><th>Conf</th><th>Opportunity</th><th>Why unknown</th></tr></thead>
              <tbody>${unknownRows || `<tr><td colspan="6">${renderEmptyState("No unknown emails are currently flagged.")}</td></tr>`}</tbody>
            </table>
          </section>
          <section>
            <h3 class="section-title">Repeated suspicious clusters</h3>
            <table>
              <thead><tr><th>Sender</th><th>Current Category</th><th>Emails</th><th>Avg Conf</th><th>Avg Review Score</th><th>Sample</th><th>Why this cluster matters</th></tr></thead>
              <tbody>${clusterRows || `<tr><td colspan="7">${renderEmptyState("No repeated suspicious clusters yet.")}</td></tr>`}</tbody>
            </table>
          </section>
          <section>
            <h3 class="section-title">Flagged emails to review next</h3>
            <table>
              <thead><tr><th>Email</th><th>Sender</th><th>Account</th><th>Category</th><th>Conf</th><th>Urgency</th><th>Opportunity</th><th>Review Score</th><th>Why flagged</th></tr></thead>
              <tbody>${suspiciousRows || `<tr><td colspan="9">${renderEmptyState("No suspicious emails are currently flagged.")}</td></tr>`}</tbody>
            </table>
          </section>
          <section>
            <h3 class="section-title">Category audit table</h3>
            <table>
              <thead><tr><th>Category</th><th>Family</th><th>Emails</th><th>Avg Confidence</th><th>Avg Urgency</th><th>Avg Opportunity</th><th>Low Conf</th><th>High Urgency</th><th>Samples</th></tr></thead>
              <tbody>${categoryRows}</tbody>
            </table>
          </section>
        </div>`
      )
    );
  });

  app.get("/parse-issues", async (req, res) => {
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : "";
    const gmailAccounts = await prisma.gmailAccount.findMany({
      orderBy: {
        email: "asc"
      },
      select: {
        id: true,
        email: true
      }
    });
    const selectedAccount = gmailAccounts.find((account) => account.id === accountId) ?? null;
    const parseIssues = await prisma.parseIssue.findMany({
      where: accountId ? { gmailAccountId: accountId } : undefined,
      include: {
        email: true,
        gmailAccount: true
      },
      orderBy: [
        { resolvedAt: "asc" },
        { lastSeenAt: "desc" }
      ],
      take: 250
    });

    const openIssues = parseIssues.filter((issue) => !issue.resolvedAt);
    const resolvedIssues = parseIssues.filter((issue) => issue.resolvedAt);
    const issueTypeChart = renderHorizontalBarChart(
      Array.from(
        openIssues.reduce((map, issue) => {
          const key = `${issue.stage} · ${issue.issueType}`;
          map.set(key, (map.get(key) ?? 0) + 1);
          return map;
        }, new Map<string, number>())
      )
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value),
      {
        valueFormatter: (value) => `${value} open`
      }
    );

    const senderDomainChart = renderHorizontalBarChart(
      Array.from(
        openIssues.reduce((map, issue) => {
          const key = issue.email?.senderDomain ?? issue.email?.senderEmail ?? "unknown";
          map.set(key, (map.get(key) ?? 0) + 1);
          return map;
        }, new Map<string, number>())
      )
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 12),
      {
        valueFormatter: (value) => `${value} open`
      }
    );

    const rows = parseIssues
      .map((issue) => {
        const details = issue.detailsJson && typeof issue.detailsJson === "object"
          ? JSON.stringify(issue.detailsJson)
          : null;
        const status = issue.resolvedAt ? "Resolved" : "Open";
        const emailLabel = escapeHtml(issue.email?.subject ?? issue.gmailMessageId);
        const emailLink = issue.emailId
          ? `<a href="/emails/${issue.emailId}">${emailLabel}</a>`
          : emailLabel;

        return `<tr>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(issue.stage)}</td>
          <td>${escapeHtml(issue.issueType)}</td>
          <td>${escapeHtml(issue.severity)}</td>
          <td>${emailLink}</td>
          <td>${escapeHtml(issue.email?.senderEmail ?? issue.email?.senderDomain ?? "unknown")}</td>
          <td>${issue.occurrenceCount}</td>
          <td>${formatDate(issue.lastSeenAt)}</td>
          <td>${escapeHtml(issue.summary)}${details ? `<br /><span class="muted">${escapeHtml(details)}</span>` : ""}</td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "Parse Issues",
        `${renderHero("Parse issue ledger", "Track every email we could not store or parse perfectly. This turns parser drift and malformed payloads into a visible backlog we can steadily drive toward zero.")}
        <form method="get">
          <select name="accountId">
            <option value="">All Gmail accounts</option>
            ${gmailAccounts
              .map((account) => `<option value="${account.id}" ${account.id === accountId ? "selected" : ""}>${escapeHtml(account.email)}</option>`)
              .join("")}
          </select>
          <button type="submit">Update Scope</button>
        </form>
        <p class="muted">Scope: ${escapeHtml(selectedAccount?.email ?? "All Gmail accounts")}</p>
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Tracked Issues</div><div class="summary-value">${parseIssues.length}</div></div>
          <div class="summary-card"><div class="summary-label">Open Issues</div><div class="summary-value">${openIssues.length}</div></div>
          <div class="summary-card"><div class="summary-label">Resolved</div><div class="summary-value">${resolvedIssues.length}</div></div>
          <div class="summary-card"><div class="summary-label">Distinct Gmail Messages</div><div class="summary-value">${new Set(parseIssues.map((issue) => issue.gmailMessageId)).size}</div></div>
        </section>
        <div class="grid">
          ${renderChartCard("Open parse issues by type", "Use this to see whether we are mostly losing links, classification payloads, or entire message fidelity.", issueTypeChart)}
          ${renderChartCard("Open parse issues by sender", "Repeated issues from the same sender usually point to one parser edge case we can fix once.", senderDomainChart)}
          <section>
            <h3 class="section-title">Issue backlog</h3>
            <table>
              <thead><tr><th>Status</th><th>Stage</th><th>Issue Type</th><th>Severity</th><th>Email</th><th>Sender</th><th>Seen</th><th>Last Seen</th><th>Details</th></tr></thead>
              <tbody>${rows || `<tr><td colspan="9">${renderEmptyState("No parse issues tracked yet.")}</td></tr>`}</tbody>
            </table>
          </section>
        </div>`
      )
    );
  });

  app.get("/sync-runs", async (req, res) => {
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : "";
    const gmailAccounts = await prisma.gmailAccount.findMany({
      orderBy: {
        email: "asc"
      },
      select: {
        id: true,
        email: true
      }
    });
    const selectedAccount = gmailAccounts.find((account) => account.id === accountId) ?? null;
    const syncRuns = await prisma.syncRun.findMany({
      where: accountId ? { gmailAccountId: accountId } : undefined,
      include: {
        gmailAccount: true
      },
      orderBy: {
        startedAt: "desc"
      },
      take: 250
    });

    const totalRuns = syncRuns.length;
    const completedRuns = syncRuns.filter((run) => run.status === "SUCCEEDED");
    const failedRuns = syncRuns.filter((run) => run.status === "FAILED");
    const runningRuns = syncRuns.filter((run) => run.status === "RUNNING");
    const totalProcessed = syncRuns.reduce((sum, run) => sum + run.processedCount, 0);
    const totalDuplicates = syncRuns.reduce((sum, run) => sum + run.duplicateCount, 0);
    const totalPages = syncRuns.reduce((sum, run) => sum + run.pagesProcessed, 0);

    const modeChart = renderHorizontalBarChart(
      Array.from(
        syncRuns.reduce((map, run) => {
          map.set(run.mode, (map.get(run.mode) ?? 0) + 1);
          return map;
        }, new Map<string, number>())
      )
        .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value),
      {
        valueFormatter: (value) => `${value} runs`
      }
    );

    const productivityChart = renderHorizontalBarChart(
      syncRuns
        .slice(0, 12)
        .map((run) => ({
          label: `${run.mode} · ${formatDate(run.startedAt)}`,
          value: run.processedCount + run.duplicateCount
        })),
      {
        valueFormatter: (value) => `${value} emails`
      }
    );

    const rows = syncRuns
      .map((run) => {
        const statusTone =
          run.status === "SUCCEEDED" ? "score-low" : run.status === "FAILED" ? "score-high" : "score-medium";
        const notes =
          run.notesJson && typeof run.notesJson === "object" ? JSON.stringify(run.notesJson) : null;

        return `<tr>
          <td><span class="score ${statusTone}">${escapeHtml(run.status)}</span></td>
          <td>${escapeHtml(run.mode)}</td>
          <td>${escapeHtml(run.gmailAccount?.email ?? "n/a")}</td>
          <td>${run.maxPages ?? "n/a"}</td>
          <td>${run.pageOffset ?? 0}</td>
          <td>${run.pagesProcessed}</td>
          <td>${run.processedCount}</td>
          <td>${run.duplicateCount}</td>
          <td>${formatDate(run.startedAt)}</td>
          <td>${formatDate(run.completedAt)}</td>
          <td>${escapeHtml(run.latestHistoryId ?? "n/a")}</td>
          <td>${escapeHtml(run.errorMessage ?? notes ?? "n/a")}</td>
        </tr>`;
      })
      .join("");

    res.send(
      renderPage(
        "Sync Runs",
        `${renderHero("Sync run history", "Track every incremental sync, full sync, backfill, and recovery run. This gives us a durable record of inbox coverage, duplicate rate, and operational health as we process more of your mailbox.")}
        <form method="get">
          <select name="accountId">
            <option value="">All Gmail accounts</option>
            ${gmailAccounts
              .map((account) => `<option value="${account.id}" ${account.id === accountId ? "selected" : ""}>${escapeHtml(account.email)}</option>`)
              .join("")}
          </select>
          <button type="submit">Update Scope</button>
        </form>
        <p class="muted">Scope: ${escapeHtml(selectedAccount?.email ?? "All Gmail accounts")}</p>
        <section class="summary-grid">
          <div class="summary-card"><div class="summary-label">Tracked Runs</div><div class="summary-value">${totalRuns}</div></div>
          <div class="summary-card"><div class="summary-label">Succeeded</div><div class="summary-value">${completedRuns.length}</div></div>
          <div class="summary-card"><div class="summary-label">Failed</div><div class="summary-value">${failedRuns.length}</div></div>
          <div class="summary-card"><div class="summary-label">Running</div><div class="summary-value">${runningRuns.length}</div></div>
          <div class="summary-card"><div class="summary-label">Emails Seen</div><div class="summary-value">${formatCompactNumber(totalProcessed + totalDuplicates)}</div></div>
          <div class="summary-card"><div class="summary-label">Pages Processed</div><div class="summary-value">${formatCompactNumber(totalPages)}</div></div>
        </section>
        <div class="grid">
          ${renderChartCard("Run mix", "See how often we are doing incremental syncs versus full syncs, backfills, and recovery runs.", modeChart)}
          ${renderChartCard("Recent run volume", "A quick scan of the last dozen runs by total emails touched.", productivityChart)}
          <section>
            <h3 class="section-title">Run ledger</h3>
            <table>
              <thead><tr><th>Status</th><th>Mode</th><th>Account</th><th>Max Pages</th><th>Offset</th><th>Pages</th><th>New</th><th>Duplicates</th><th>Started</th><th>Completed</th><th>History</th><th>Notes / Error</th></tr></thead>
              <tbody>${rows || `<tr><td colspan="12">${renderEmptyState("No sync runs recorded yet.")}</td></tr>`}</tbody>
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
