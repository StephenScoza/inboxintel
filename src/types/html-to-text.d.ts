declare module "html-to-text" {
  export interface HtmlToTextOptions {
    wordwrap?: false | number;
    selectors?: Array<{
      selector: string;
      options?: Record<string, unknown>;
    }>;
  }

  export function convert(value: string, options?: HtmlToTextOptions): string;
}
