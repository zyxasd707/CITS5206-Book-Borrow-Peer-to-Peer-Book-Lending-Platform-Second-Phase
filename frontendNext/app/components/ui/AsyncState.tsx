"use client";

import Button from "./Button";

type CommonProps = {
  title: string;
  description?: string;
  className?: string;
};

type ErrorStateProps = CommonProps & {
  retryLabel?: string;
  onRetry?: () => void;
};

export function LoadingState({ title, description, className = "" }: CommonProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-6 text-center ${className}`}>
      <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
      <p className="text-sm font-medium text-gray-800">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  retryLabel = "Retry",
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div className={`rounded-lg border border-red-200 bg-red-50 p-6 text-center ${className}`}>
      <p className="text-sm font-semibold text-red-800">{title}</p>
      {description && <p className="mt-1 text-sm text-red-700">{description}</p>}
      {onRetry && (
        <div className="mt-3">
          <Button variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, description, className = "" }: CommonProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-gray-50 p-6 text-center ${className}`}>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
  );
}
