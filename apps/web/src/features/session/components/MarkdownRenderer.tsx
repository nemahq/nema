import "./markdown-renderer.css";

import { lazy, memo, Suspense } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const LazyCodeBlock = lazy(() =>
  import("./CodeBlock").then((m) => ({ default: m.CodeBlock })),
);

interface CodeBlockPlaceholderProps {
  className?: string;
  children?: React.ReactNode;
}

function CodeBlockFallback({ className, children }: CodeBlockPlaceholderProps) {
  return <code className={className}>{children}</code>;
}

function CodeBlockWrapper({ className, children }: CodeBlockPlaceholderProps) {
  if (!className?.startsWith("language-")) {
    return <code className={className}>{children}</code>;
  }
  return (
    <Suspense
      fallback={
        <CodeBlockFallback className={className}>{children}</CodeBlockFallback>
      }
    >
      <LazyCodeBlock className={className}>{children}</LazyCodeBlock>
    </Suspense>
  );
}

const REMARK_PLUGINS = [remarkGfm];
const COMPONENTS = { code: CodeBlockWrapper };

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  return (
    <div className="prose-chat">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {content}
      </Markdown>
    </div>
  );
});
