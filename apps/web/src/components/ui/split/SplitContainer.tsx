import { BranchRenderer } from "./BranchRenderer";
import type { SplitNode } from "./types";
import { DEFAULT_MIN_SIZE } from "./types";

interface SplitContainerProps {
  root: SplitNode;
  minSize?: number;
  onRatiosChange?: (nodeId: string, ratios: number[]) => void;
}

export function SplitContainer({
  root,
  minSize = DEFAULT_MIN_SIZE,
  onRatiosChange,
}: SplitContainerProps) {
  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <SplitNodeRenderer
        node={root}
        minSize={minSize}
        onRatiosChange={onRatiosChange}
      />
    </div>
  );
}

interface SplitNodeRendererProps {
  node: SplitNode;
  minSize: number;
  onRatiosChange?: (nodeId: string, ratios: number[]) => void;
}

function SplitNodeRenderer({
  node,
  minSize,
  onRatiosChange,
}: SplitNodeRendererProps) {
  function renderNode(child: SplitNode) {
    return (
      <SplitNodeRenderer
        node={child}
        minSize={minSize}
        onRatiosChange={onRatiosChange}
      />
    );
  }

  if (node.type === "leaf") {
    return <div className="flex flex-1 min-h-0 min-w-0">{node.content}</div>;
  }

  return (
    <BranchRenderer
      node={node}
      minSize={minSize}
      onRatiosChange={onRatiosChange}
      renderNode={renderNode}
    />
  );
}
