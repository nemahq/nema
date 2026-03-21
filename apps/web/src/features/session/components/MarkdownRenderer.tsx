import "streamdown/styles.css";
import "./markdown-renderer.css";

import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

const PLUGINS = { code };

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose-chat">
      <Streamdown plugins={PLUGINS} controls={false}>
        {content}
      </Streamdown>
    </div>
  );
}
