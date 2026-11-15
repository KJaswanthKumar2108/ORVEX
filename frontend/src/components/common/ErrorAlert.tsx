import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  title = "Data Retrieval Error",
  message,
  onRetry,
}) => {
  return (
    <div
      role="alert"
      className="bg-rose-950/40 border border-rose-800/80 rounded-lg p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-rose-200"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-rose-300">{title}</h4>
          <p className="text-xs text-rose-200/90 mt-0.5">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-rose-900/60 hover:bg-rose-800/80 text-rose-100 border border-rose-700/60 transition-colors cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};
