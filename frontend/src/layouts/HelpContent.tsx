import type { ReactNode } from 'react'
import type { PageKey } from './navigation'

const SAFETY = (
  <p>
    DriveClean never deletes anything permanently. Files you choose go to Google Drive&apos;s Trash, where you can
    restore them for 30 days.
  </p>
)

const HELP: Record<PageKey, { header: string; body: ReactNode }> = {
  dashboard: {
    header: 'Dashboard',
    body: (
      <>
        <p>
          A scan reads the metadata of every file in your Drive (names, sizes, dates, checksums). Nothing is downloaded or
          changed.
        </p>
        <p>
          Quick sync picks up only what changed since the last scan or sync, so it usually takes seconds. Run a full scan
          again if the numbers look out of date.
        </p>
        {SAFETY}
      </>
    ),
  },
  files: {
    header: 'Files',
    body: <p>Every file and folder found by the last scan. Search by name or show items in Trash.</p>,
  },
  analytics: {
    header: 'Storage analytics',
    body: (
      <p>
        Where your storage goes, by file type, by year and by folder. Folder sizes include everything inside them. Items in
        Trash still count against your storage until Drive deletes them.
      </p>
    ),
  },
  duplicates: {
    header: 'Duplicates',
    body: (
      <>
        <p>
          Duplicates are exact copies: files with the same content checksum (MD5) and the same size. Google Docs, Sheets
          and Slides have no checksum, so they are never matched.
        </p>
        <p>
          In each group the oldest copy is suggested to keep. Applying suggestions marks the other copies for Trash; you
          can change any file. Nothing changes in Drive on this page: open Cleanup to move marked files to Trash.
        </p>
        {SAFETY}
      </>
    ),
  },
  similar: {
    header: 'Similar photos',
    body: (
      <>
        <p>
          Similar photos look the same but are not identical files: resized, re-saved or lightly edited copies. Each group
          is a suggestion; look at the previews before you trash anything.
        </p>
        <p>
          The analysis reads a small preview of each photo from Google, never the original. The first run on a large
          Drive can take several minutes. It can be stopped and resumed, and later runs only look at new or changed photos.
          Photos under 30 KB are skipped.
        </p>
        <p>The largest copy in each group is suggested to keep.</p>
        {SAFETY}
      </>
    ),
  },
  organizer: {
    header: 'Organizer',
    body: (
      <>
        <p>
          Suggestions for moving loose files into folders. <strong>By content</strong> has a language model read a short excerpt
          of each file (text, the first pages of a scanned PDF, or a small image preview) and pick a topic folder such as
          Medical or Education. A folder you already have with that name is reused; otherwise it is created at the top of
          your Drive when you move. By default the model runs locally in Ollama, so the excerpts never leave your machine; the
          backend can be set to use Claude instead.
        </p>
        <p>
          <strong>By file patterns</strong> uses only file types, dates and names to match files to existing folders that
          hold similar files, and sends nothing anywhere.
        </p>
        <p>
          Reading contents and moving files need the broader Google permission. Every move can be undone from the move
          history; folders created for a move stay in place.
        </p>
      </>
    ),
  },
  archives: {
    header: 'Archives',
    body: (
      <>
        <p>
          Zip, rar and tar files you own. Extracting one downloads it to the DriveClean server, then uploads its files
          into a new folder with the archive&apos;s name in the same place, keeping the folders inside the archive.
        </p>
        <p>
          Each uploaded file is checked against the extracted one. Only when every file is in Drive does the archive move
          to Trash, recorded in the Cleanup history so you can restore it. If a run fails or you cancel it, the archive
          stays, and extracting it again continues in the same folder without uploading files twice.
        </p>
        <p>
          Links, files that would land outside the folder, and macOS metadata (__MACOSX, .DS_Store) are skipped.
          Password-protected archives are not supported.
        </p>
      </>
    ),
  },
  cleanup: {
    header: 'Cleanup',
    body: (
      <>
        <p>
          Files you marked for Trash on the Duplicates and Similar photos pages. Before each file is moved, the copy you
          keep is checked against Drive so you never lose the last copy.
        </p>
        <p>
          Large selections run in the background, roughly a second per file. You can cancel the rest, and restore any file
          from the history.
        </p>
        {SAFETY}
      </>
    ),
  },
  trash: {
    header: 'Trash',
    body: (
      <>
        <p>
          Files you own that are in Google Drive&apos;s Trash. They still count against your storage until Drive deletes them,
          which it does automatically 30 days after they were trashed.
        </p>
        <p>
          To free the space sooner, empty the Trash in Drive. That is permanent, so DriveClean does not do it for you.
        </p>
      </>
    ),
  },
  scans: {
    header: 'Scan history',
    body: <p>Every full scan, with how many files it read, how long it took and any error.</p>,
  },
  settings: {
    header: 'Settings',
    body: (
      <p>
        Disconnecting removes DriveClean&apos;s access to your Google account. Your files in Drive are not affected.
      </p>
    ),
  },
}

/** The help drawer's content for one page. */
export default function HelpContent({ page }: { page: PageKey }) {
  const h = HELP[page]
  return (
    <div>
      <h2 className="text-lg font-bold">{h.header}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{h.body}</div>
    </div>
  )
}
