export default function FetchError({ message, onRetry }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800">Failed to load data</p>
        <p className="text-xs text-red-600 mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-300
                     hover:bg-red-100 rounded-lg transition shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  )
}
