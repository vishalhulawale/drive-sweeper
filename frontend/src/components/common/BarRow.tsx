import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { formatBytes } from '../../utils/format'

/** One labelled horizontal bar; width is relative to `max`. */
export default function BarRow({
  label, bytes, max, detail,
}: { label: string; bytes: number; max: number; detail?: string }) {
  const pct = max > 0 ? Math.max(1, (bytes / max) * 100) : 0
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', py: 0.5 }}>
      <Typography variant="body2" sx={{ width: 110, flexShrink: 0 }} noWrap title={label}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, bgcolor: 'action.hover', borderRadius: 1, height: 14 }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: 'primary.main', borderRadius: 1 }} />
      </Box>
      <Typography variant="body2" sx={{ width: 150, textAlign: 'right', flexShrink: 0 }}>
        {formatBytes(bytes)}
        {detail ? ` · ${detail}` : ''}
      </Typography>
    </Stack>
  )
}
