import React from "react";
import { THEME } from "../../theme/tokens";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  badge,
  actions,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-800/80 ${className}`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 shrink-0 shadow-inner mt-0.5">
            {icon}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className={THEME.typography.pageTitle}>{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="text-xs sm:text-sm text-slate-400 mt-1">{subtitle}</p>}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-center shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};

