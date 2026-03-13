import React from "react";

type OtherBlockProps = {
  tool: string;
  params?: unknown;
};

export const OtherBlock: React.FC<OtherBlockProps> = ({ tool, params }) => {
  return (
    <div className="feed-block feed-block-other" aria-label="Action">
      <div className="feed-block-label">{tool}</div>
      {params != null && Object.keys(params as object).length > 0 && (
        <pre className="feed-block-content feed-block-params">
          {JSON.stringify(params, null, 2)}
        </pre>
      )}
    </div>
  );
};
