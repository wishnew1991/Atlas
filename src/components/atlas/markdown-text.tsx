import { Fragment, type ReactNode } from "react";

// Minimal, dependency-free markdown renderer for the chat thread.
//
// The food tools emit a constrained markdown subset — `**bold**`, line breaks,
// and bullet / numbered list lines. We render that subset safely (no HTML
// injection) rather than pulling in a full markdown library. Anything outside
// the supported subset is shown as plain text.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<Fragment key={`${keyPrefix}-t${i}`}>{text.slice(last, match.index)}</Fragment>);
    }
    nodes.push(<strong key={`${keyPrefix}-b${i}`}>{match[1]}</strong>);
    last = match.index + match[0].length;
    i += 1;
  }

  if (last < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t${i}`}>{text.slice(last)}</Fragment>);
  }

  return nodes;
}

function renderLine(line: string, index: number): ReactNode {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return <br key={`br-${index}`} />;
  }

  const bullet = trimmed.match(/^[-•]\s+(.*)$/);
  if (bullet) {
    return (
      <div className="atlas-md__bullet" key={`li-${index}`}>
        <span className="atlas-md__marker">•</span>
        <span>{renderInline(bullet[1], `li-${index}`)}</span>
      </div>
    );
  }

  const numbered = trimmed.match(/^(\d+)\.\s+(.*)$/);
  if (numbered) {
    return (
      <div className="atlas-md__bullet" key={`li-${index}`}>
        <span className="atlas-md__marker">{numbered[1]}.</span>
        <span>{renderInline(numbered[2], `li-${index}`)}</span>
      </div>
    );
  }

  return (
    <p className="atlas-md__line" key={`p-${index}`}>
      {renderInline(trimmed, `p-${index}`)}
    </p>
  );
}

export function MarkdownText({ text }: { text?: string }) {
  if (typeof text !== "string" || text.length === 0) {
    return null;
  }
  const lines = text.split("\n");
  return <div className="atlas-md">{lines.map((line, index) => renderLine(line, index))}</div>;
}
