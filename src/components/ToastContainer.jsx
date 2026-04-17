import { useRealtime } from '../contexts/RealtimeContext'

const TOAST_ICONS = {
  complaint: { bg: 'bg-red-500', icon: FlagIcon },
  announcement: { bg: 'bg-blue-500', icon: MegaphoneIcon },
  payment: { bg: 'bg-green-500', icon: CurrencyIcon },
  info: { bg: 'bg-gray-600', icon: InfoIcon },
}

export default function ToastContainer() {
  const { toasts, dismissToast } = useRealtime()

  if (!toasts.length) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => {
        const style = TOAST_ICONS[t.type] ?? TOAST_ICONS.info
        const Icon = style.icon
        return (
          <div
            key={t.id}
            className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl shadow-lg
                       border border-gray-100 animate-slide-in"
          >
            <div className={`w-8 h-8 ${style.bg} rounded-lg flex items-center justify-center shrink-0`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm text-gray-800 font-medium flex-1">{t.message}</p>
            <button
              onClick={() => dismissToast(t.id)}
              className="text-gray-400 hover:text-gray-600 transition shrink-0"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function FlagIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V3m0 4l9-2 9 2-9 2-9-2z" /></svg>
}
function MegaphoneIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
}
function CurrencyIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function InfoIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function XIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
}
