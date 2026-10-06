/**
 * The founder emails' shared HTML look: one column, 16px body text, about 24px
 * between sections, small grey section labels, label/value rows as a plain
 * 2-column table, quotes set off by a grey left border, and a small grey
 * details block at the foot.
 *
 * Everything is inline-styled (Gmail drops <style> blocks in many clients).
 * Pure: no Convex, no env. Callers pass RAW text; every helper here escapes.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#1a1a1a";
const GREY = "#6b6b6b";
const FAINT = "#8a8a8a";
const RULE = "#e3e3e3";

/** The outer frame: a centred 600px column. `inner` is already HTML. */
export function emailShell(inner: string): string {
  return (
    `<div style="font-family:${FONT};font-size:16px;line-height:1.5;color:${INK};` +
    `max-width:600px;margin:0 auto;padding:8px 4px">\n${inner}\n</div>`
  );
}

/** The big first line ("❌ Not understood"). */
export function headline(text: string): string {
  return `<h1 style="font-size:22px;line-height:1.3;font-weight:700;margin:0 0 6px">${escapeHtml(text)}</h1>`;
}

/** A plain paragraph under the headline. */
export function lead(text: string): string {
  return `<p dir="auto" style="margin:0;font-size:16px;color:${INK}">${escapeHtml(text)}</p>`;
}

/** A small grey uppercase section label, with the section gap above it. */
export function sectionHeading(text: string): string {
  return (
    `<h2 style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;` +
    `color:${GREY};margin:24px 0 8px">${escapeHtml(text)}</h2>`
  );
}

/** Label/value rows as a simple 2-column table. Values are raw text. */
export function kvTable(rows: Array<[string, string]>, opts: { marginTop?: number } = {}): string {
  const top = opts.marginTop ?? 24;
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:3px 16px 3px 0;color:${GREY};font-size:15px;vertical-align:top;white-space:nowrap">` +
        `${escapeHtml(label)}</td><td dir="auto" style="padding:3px 0;font-size:16px;vertical-align:top">` +
        `${escapeHtml(value)}</td></tr>`
    )
    .join("");
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="border-collapse:collapse;margin:${top}px 0 0">${cells}</table>`
  );
}

/** A quoted line set off by a grey left border, with grey notes under it. */
export function quoteBlock(text: string, notes: string[] = []): string {
  const noteHtml = notes
    .map((note) => `<div dir="auto" style="margin-top:4px;font-size:15px;color:${GREY}">${escapeHtml(note)}</div>`)
    .join("");
  return (
    `<blockquote style="margin:0;padding:2px 0 2px 14px;border-left:3px solid #d0d0d0">` +
    `<div dir="auto" style="font-size:16px">${escapeHtml(text)}</div>${noteHtml}</blockquote>`
  );
}

/** A paragraph inside a section. */
export function paragraph(text: string, opts: { muted?: boolean; bold?: boolean } = {}): string {
  const color = opts.muted ? GREY : INK;
  const weight = opts.bold ? "font-weight:600;" : "";
  return `<p dir="auto" style="margin:0 0 4px;font-size:16px;${weight}color:${color}">${escapeHtml(text)}</p>`;
}

/**
 * The grey details block at the foot. Lines are raw text; a line starting
 * with `npx ` is shown as code so it can be copied whole.
 */
export function detailsBlock(lines: string[], title = "Details"): string {
  const body = lines
    .map((line) => {
      const escaped = escapeHtml(line);
      const html = escaped.replace(
        /(npx convex run .*)$/,
        `<code style="font-size:11px;background:#f2f2f5;padding:1px 4px;border-radius:4px">$1</code>`
      );
      return `<div>${html}</div>`;
    })
    .join("\n");
  return (
    `<div style="margin-top:32px;padding-top:12px;border-top:1px solid ${RULE};color:${FAINT};` +
    `font-size:12px;line-height:1.6;word-break:break-word">\n` +
    `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(title)}</div>\n${body}\n</div>`
  );
}

/** The plain-text rule before the details. */
export const TEXT_RULE = "──────────";
