import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DashboardIcon from '@mui/icons-material/Dashboard'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import HistoryIcon from '@mui/icons-material/History'
import PieChartIcon from '@mui/icons-material/PieChart'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import SettingsIcon from '@mui/icons-material/Settings'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStatus } from '../hooks/useGoogleDrive'

const WIDTH = 220
const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/files', label: 'Files', icon: <FolderOpenIcon /> },
  { to: '/analytics', label: 'Analytics', icon: <PieChartIcon /> },
  { to: '/duplicates', label: 'Duplicates', icon: <ContentCopyIcon /> },
  { to: '/organizer', label: 'Organizer', icon: <AutoFixHighIcon /> },
  { to: '/cleanup', label: 'Cleanup', icon: <DeleteSweepIcon /> },
  { to: '/scans', label: 'Scan history', icon: <HistoryIcon /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
]

export default function MainLayout() {
  const auth = useAuthStatus()
  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            DriveClean
          </Typography>
          {auth.data?.email && <Chip label={auth.data.email} color="default" size="small" />}
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{ width: WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: WIDTH, boxSizing: 'border-box' } }}
      >
        <Toolbar />
        <List>
          {NAV.map((n) => (
            <ListItemButton key={n.to} component={NavLink} to={n.to} end={n.to === '/'}>
              <ListItemIcon>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, minWidth: 0 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  )
}
