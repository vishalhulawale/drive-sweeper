import Link from '@cloudscape-design/components/link'
import { useHelp } from '../../layouts/help'

/** The "Info" link next to a header; opens the page's help panel. */
export default function InfoLink({ label = 'Info' }: { label?: string }) {
  const { openHelp } = useHelp()
  return (
    <Link variant="info" onFollow={(e) => { e.preventDefault(); openHelp() }}>
      {label}
    </Link>
  )
}
