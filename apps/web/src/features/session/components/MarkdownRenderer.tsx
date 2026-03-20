import "streamdown/styles.css";
import "./markdown-renderer.css";

import { memo } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

const PLUGINS = { code };

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  return (
    <div className="prose-chat">
      <Streamdown plugins={PLUGINS} controls={false}>
        {content}
      </Streamdown>
    </div>
  );
});
