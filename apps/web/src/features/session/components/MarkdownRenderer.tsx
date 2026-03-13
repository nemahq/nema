import "./markdown-renderer.css";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "./CodeBlock";

const REMARK_PLUGINS = [remarkGfm];
const COMPONENTS = { code: CodeBlock };

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose-chat">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {content}
      </Markdown>
    </div>
  );
}
