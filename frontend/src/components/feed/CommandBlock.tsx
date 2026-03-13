import React from "react";

type CommandBlockProps = {
  tool: string;
  params?: unknown;
};

function getCommandLabel(tool: string, params: unknown): string {
  const p = params as Record<string, unknown> | undefined;
  switch (tool) {
    case "runCommand": {
      const cmd = typeof p?.command === "string" ? p.command : "?";
      const cwd = typeof p?.cwd === "string" ? p.cwd : undefined;
      const parts = cmd.split(/\s+/).filter(Boolean);
      const short = parts.slice(0, 3).join(" ");
      const suffix = parts.length > 3 ? "…" : "";
      return cwd ? `Run ${short}${suffix} (cwd: ${cwd})` : `Run ${short}${suffix}`;
    }
    case "runNpm": {
      const args = typeof p?.args === "string" ? p.args : "?";
      const cwd = typeof p?.cwd === "string" ? p.cwd : undefined;
      return cwd ? `npm ${args} (cwd: ${cwd})` : `npm ${args}`;
    }
    default:
      return tool;
  }
}

export const CommandBlock: React.FC<CommandBlockProps> = ({ tool, params }) => {
  const label = getCommandLabel(tool, params);
  return (
    <div className="feed-block feed-block-command" aria-label="Command">
      <div className="feed-block-label">{label}</div>
    </div>
  );
};
