import { Link } from 'react-router'
import { describeSync } from '../sync/describeSync.ts'
import { useSync } from '../sync/useSync.ts'

/** A line saying whether your stats have reached the server. Tapping it opens the account screen. */
function SyncStatus({ link = true }: { link?: boolean }) {
  const { text, tone } = describeSync(useSync())
  const content = (
    <>
      <span className="sync-dot" aria-hidden="true" />
      {text}
    </>
  )
  const className = `sync-status sync-${tone}`
  return link ? (
    <Link className={className} to="/account">
      {content}
    </Link>
  ) : (
    <p className={className} role="status">
      {content}
    </p>
  )
}

export default SyncStatus
