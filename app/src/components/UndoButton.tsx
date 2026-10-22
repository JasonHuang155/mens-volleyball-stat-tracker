import { useState } from 'react'
import { db } from '../db/database.ts'
import { undoLastTap } from '../db/matches.ts'
import type { Match } from '../domain/types.ts'
import { errorMessage } from './errorMessage.ts'

/** Cancels the last play (or the last set start). Nothing is deleted: an undo event is saved. */
function UndoButton({ match }: { match: Match }) {
  const [error, setError] = useState('')

  async function handleClick() {
    try {
      await undoLastTap(db, match)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <button className="button" type="button" onClick={handleClick}>
        Undo
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

export default UndoButton
