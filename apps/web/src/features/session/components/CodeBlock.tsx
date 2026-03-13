import { useState } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";

import { Button } from "@nema-io/weave";
import { Check, Copy } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("jsx", jsx);

function isDark() {
  return document.documentElement.classList.contains("dark");
}

export function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const match = className?.match(/language-(\w+)/);
  const lang = match?.[1] ?? "";
  const code = String(children).replace(/\n$/, "");

  if (!match) {
    return <code className={className}>{children}</code>;
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative">
      <div className="flex items-center justify-between rounded-t-lg bg-surface-base px-4 py-2 text-xs text-fg-tertiary">
        <span>{lang}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          aria-label={copied ? t("session.copied") : t("session.copy_code")}
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          {copied ? (
            <Check className="size-3.5 text-status-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={isDark() ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          padding: "1rem",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          background: "var(--color-surface-base)",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
