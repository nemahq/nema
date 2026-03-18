import "./writing-cursor.css";

function WritingCursor() {
  return (
    <div
      className="h-5 w-[2px] rounded-sm bg-fg-secondary"
      style={{ animation: "writing-cursor-blink 1s ease-in-out infinite" }}
      aria-hidden
    />
  );
}

export { WritingCursor };
