import Box from '@cloudscape-design/components/box'
import HelpPanel from '@cloudscape-design/components/help-panel'
import type { ReactNode } from 'react'
import type { PageKey } from './navigation'

const SAFETY = (
  <Box variant="p">
    DriveClean never deletes anything permanently. Files you choose go to Google Drive&apos;s Trash, where you can
    restore them for 30 days.
  </Box>
)

const HELP: Record<PageKey, { header: string; body: ReactNode }> = {
  dashboard: {
    header: 'Dashboard',
    body: (
      <>
        <Box variant="p">
          A scan reads the metadata of every file in your Drive (names, sizes, dates, checksums). Nothing is downloaded or
          changed.
        </Box>
        <Box variant="p">
          Quick sync picks up only what changed since the last scan or sync, so it usually takes seconds. Run a full scan
          again if the numbers look out of date.
        </Box>
        {SAFETY}
      </>
    ),
  },
  files: {
    header: 'Files',
    body: <Box variant="p">Every file and folder found by the last scan. Search by name or show items in Trash.</Box>,
  },
  analytics: {
    header: 'Storage analytics',
    body: (
      <Box variant="p">
        Where your storage goes, by file type, by year and by folder. Folder sizes include everything inside them. Items in
        Trash still count against your storage until Drive deletes them.
      </Box>
    ),
  },
  duplicates: {
    header: 'Duplicates',
    body: (
      <>
        <Box variant="p">
          Duplicates are exact copies: files with the same content checksum (MD5) and the same size. Google Docs, Sheets
          and Slides have no checksum, so they are never matched.
        </Box>
        <Box variant="p">
          In each group the oldest copy is suggested to keep. Applying suggestions marks the other copies for Trash; you
          can change any file. Nothing changes in Drive on this page: open Cleanup to move marked files to Trash.
        </Box>
        {SAFETY}
      </>
    ),
  },
  similar: {
    header: 'Similar photos',
    body: (
      <>
        <Box variant="p">
          Similar photos look the same but are not identical files: resized, re-saved or lightly edited copies. Each group
          is a suggestion; look at the previews before you trash anything.
        </Box>
        <Box variant="p">
          The analysis reads a small preview of each photo from Google, never the original. The first run on a large
          Drive can take several minutes. It can be stopped and resumed, and later runs only look at new or changed photos.
          Photos under 30 KB are skipped.
        </Box>
        <Box variant="p">The largest copy in each group is suggested to keep.</Box>
        {SAFETY}
      </>
    ),
  },
  organizer: {
    header: 'Organizer',
    body: (
      <Box variant="p">
        Suggestions for moving loose files into folders that already hold similar files. Moving a file needs a broader
        Google permission. Every move can be undone from the move history.
      </Box>
    ),
  },
  cleanup: {
    header: 'Cleanup',
    body: (
      <>
        <Box variant="p">
          Files you marked for Trash on the Duplicates and Similar photos pages. Before each file is moved, the copy you
          keep is checked against Drive so you never lose the last copy.
        </Box>
        <Box variant="p">
          Large selections run in the background, roughly a second per file. You can cancel the rest, and restore any file
          from the history.
        </Box>
        {SAFETY}
      </>
    ),
  },
  trash: {
    header: 'Trash',
    body: (
      <>
        <Box variant="p">
          Files you own that are in Google Drive&apos;s Trash. They still count against your storage until Drive deletes them,
          which it does automatically 30 days after they were trashed.
        </Box>
        <Box variant="p">
          To free the space sooner, empty the Trash in Drive. That is permanent, so DriveClean does not do it for you.
        </Box>
      </>
    ),
  },
  scans: {
    header: 'Scan history',
    body: <Box variant="p">Every full scan, with how many files it read, how long it took and any error.</Box>,
  },
  settings: {
    header: 'Settings',
    body: (
      <Box variant="p">
        Disconnecting removes DriveClean&apos;s access to your Google account. Your files in Drive are not affected.
      </Box>
    ),
  },
}

export default function HelpContent({ page }: { page: PageKey }) {
  const h = HELP[page]
  return <HelpPanel header={<h2>{h.header}</h2>}>{h.body}</HelpPanel>
}
