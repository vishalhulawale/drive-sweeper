import { useHelp } from '../../layouts/help'

/** The "Info" link next to a header; opens the page's help panel. */
export default function InfoLink({ label = 'Info' }: { label?: string }) {
  const { openHelp } = useHelp()
  return (
    <button type="button" onClick={openHelp} className="text-sm font-bold text-brand-600 hover:underline dark:text-brand-500">
      {label}
    </button>
  )
}
