import { ClassificationResult, classifyEmail } from "../classifier/classifyEmail";
import { ExtractedAmount, extractAmounts } from "../parser/extractAmounts";
import { ExtractedDate, extractDates } from "../parser/extractDates";
import { extractSignals, ExtractedSignals } from "../parser/extractSignals";

interface BuildEmailIntelligenceInput {
  subject: string | null;
  snippet: string | null;
  plainTextBody: string | null;
  htmlBody: string | null;
  labels: string[];
  senderDomain: string | null;
  links: { url: string; domain: string | null; text: string | null }[];
}

export interface BuiltEmailIntelligence {
  combinedText: string;
  amounts: ExtractedAmount[];
  dates: ExtractedDate[];
  signals: ExtractedSignals;
  classification: ClassificationResult;
}

export function buildEmailIntelligence(input: BuildEmailIntelligenceInput): BuiltEmailIntelligence {
  const combinedText = [input.subject, input.snippet, input.plainTextBody]
    .filter(Boolean)
    .join("\n");
  const amounts = extractAmounts(combinedText);
  const dates = extractDates(combinedText);
  const signals = extractSignals({
    subject: input.subject,
    snippet: input.snippet,
    plainTextBody: input.plainTextBody,
    htmlBody: input.htmlBody,
    labels: input.labels,
    links: input.links
  });
  const classification = classifyEmail({
    subject: input.subject,
    snippet: input.snippet,
    plainTextBody: input.plainTextBody,
    htmlBody: input.htmlBody,
    labels: input.labels,
    senderDomain: input.senderDomain,
    links: input.links,
    amounts,
    dates,
    signals
  });

  return {
    combinedText,
    amounts,
    dates,
    signals,
    classification
  };
}

