import React from "react";
import { Inbox } from "lucide-react";
import { THEME } from "../../theme/tokens";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div
      className={`py-12 px-6 rounded-xl bg-[#0a0f1d] border border-dashed border-slate-800 text-center flex flex-col items-center justify-center ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-3 shadow-inner">
        {icon || <Inbox className="w-6 h-6 text-slate-500" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-200 font-sans">{title}</h3>
      {description && (
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`mt-4 ${THEME.buttons.secondary}`}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      )}
    </div>
  );
};

