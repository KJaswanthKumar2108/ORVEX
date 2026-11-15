import React from "react";

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-slate-900/60 border border-slate-800 rounded-lg p-5 animate-pulse"
        >
          <div className="h-4 bg-slate-800 rounded w-1/3 mb-4" />
          <div className="h-8 bg-slate-800 rounded w-2/3 mb-2" />
          <div className="h-3 bg-slate-800 rounded w-1/2" />
        </div>
      ))}
    </>
  );
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => {
  return (
    <div className="animate-pulse space-y-3 p-4">
      <div className="h-4 bg-slate-800 rounded w-1/4 mb-4" />
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="h-10 bg-slate-800/60 rounded flex items-center px-4 gap-4">
          <div className="h-4 bg-slate-700/80 rounded w-1/4" />
          <div className="h-4 bg-slate-700/80 rounded w-1/6" />
          <div className="h-4 bg-slate-700/80 rounded w-1/6" />
          <div className="h-4 bg-slate-700/80 rounded w-1/4" />
        </div>
      ))}
    </div>
  );
};

export const ChartSkeleton: React.FC = () => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-5 animate-pulse h-64 flex flex-col justify-between">
      <div className="h-4 bg-slate-800 rounded w-1/4" />
      <div className="h-32 bg-slate-800/40 rounded flex items-center justify-center">
        <div className="w-12 h-1 bg-slate-700 rounded" />
      </div>
      <div className="h-3 bg-slate-800 rounded w-1/3" />
    </div>
  );
};
