import "./markdown.css";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useTheme } from "@web/app/providers/ThemeProvider";

import { CodeBlock } from "./CodeBlock";

export function MarkdownRenderer({ content }: { content: string }) {
  // useTheme 구독으로 테마 전환 시 리렌더링 보장
  useTheme();

  return (
    <div className="prose-chat">
      <Markdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
        {content}
      </Markdown>
    </div>
  );
}
