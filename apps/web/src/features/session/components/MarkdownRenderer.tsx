import "./markdown.css";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "./CodeBlock";

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose-chat">
      <Markdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
        {content}
      </Markdown>
    </div>
  );
}
