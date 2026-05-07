import { ParseIssueSeverity, ParseIssueStage, ParseIssueType, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { sanitizeJsonValue, sanitizeText } from "./safeJson";

interface RecordParseIssueInput {
  emailId?: string | null;
  gmailAccountId?: string | null;
  gmailMessageId: string;
  issueType: ParseIssueType;
  stage: ParseIssueStage;
  severity: ParseIssueSeverity;
  summary: string;
  details?: Record<string, unknown>;
}

function buildParseIssueUpdate(input: RecordParseIssueInput): Prisma.ParseIssueUncheckedUpdateInput {
  return {
    emailId: input.emailId ?? undefined,
    gmailAccountId: input.gmailAccountId ?? undefined,
    severity: input.severity,
    summary: sanitizeText(input.summary) ?? input.summary,
    detailsJson: sanitizeJsonValue(input.details ?? null) as Prisma.InputJsonValue,
    occurrenceCount: {
      increment: 1
    },
    resolvedAt: null
  };
}

function buildParseIssueCreate(input: RecordParseIssueInput): Prisma.ParseIssueUncheckedCreateInput {
  return {
    emailId: input.emailId ?? undefined,
    gmailAccountId: input.gmailAccountId ?? undefined,
    gmailMessageId: input.gmailMessageId,
    issueType: input.issueType,
    stage: input.stage,
    severity: input.severity,
    summary: sanitizeText(input.summary) ?? input.summary,
    detailsJson: sanitizeJsonValue(input.details ?? null) as Prisma.InputJsonValue
  };
}

export async function recordParseIssue(input: RecordParseIssueInput) {
  await prisma.parseIssue.upsert({
    where: {
      gmailMessageId_issueType_stage: {
        gmailMessageId: input.gmailMessageId,
        issueType: input.issueType,
        stage: input.stage
      }
    },
    update: buildParseIssueUpdate(input),
    create: buildParseIssueCreate(input)
  });
}

export async function resolveParseIssuesForMessage(input: {
  gmailMessageId: string;
  stage: ParseIssueStage;
  issueTypes?: ParseIssueType[];
}) {
  await prisma.parseIssue.updateMany({
    where: {
      gmailMessageId: input.gmailMessageId,
      stage: input.stage,
      issueType: input.issueTypes ? { in: input.issueTypes } : undefined,
      resolvedAt: null
    },
    data: {
      resolvedAt: new Date()
    }
  });
}
