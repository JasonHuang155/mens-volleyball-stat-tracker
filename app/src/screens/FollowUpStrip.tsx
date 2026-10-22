import { useState } from 'react'
import { errorMessage } from '../components/errorMessage.ts'
import { db } from '../db/database.ts'
import { recordFollowUpTap } from '../db/matches.ts'
import type { Match, MatchState, Player } from '../domain/types.ts'

/** An open question after a play: who set the kill, or who else was in on the block. */
export type FollowUp = {
  kind: 'assist' | 'block'
  /** The play being added to. */
  actionId: string
  /** Players already credited on this play, so they aren't offered again. */
  alreadyCredited: string[]
}

type Props = {
  followUp: FollowUp
  match: Match
  players: Player[]
  state: MatchState
  onChange: (followUp: FollowUp | null) => void
}

/**
 * "Assist by?" after a kill, or "Who else blocked?" after a block assist.
 * Ignoring it is fine: tapping anything else closes it.
 */
function FollowUpStrip({ followUp, match, players, state, onChange }: Props) {
  const [error, setError] = useState('')
  const byId = new Map(players.map((p) => [p.id, p]))
  const candidates = state.lineup
    .filter((id) => !followUp.alreadyCredited.includes(id))
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined)
  if (followUp.kind === 'assist') {
    candidates.sort((a, b) => Number(b.position === 'S') - Number(a.position === 'S')) // setters first
  }

  const firstBlocker = followUp.alreadyCredited.length === 1
  const title = followUp.kind === 'assist' ? 'Assist by?' : firstBlocker ? 'Who else blocked?' : 'Anyone else?'

  async function pick(playerId: string) {
    try {
      if (followUp.kind === 'assist') {
        await recordFollowUpTap(db, match, { type: 'assist', playerId })
        onChange(null) // one assist per kill
      } else {
        await recordFollowUpTap(db, match, { type: 'block', playerId, result: 'assist' })
        onChange({ ...followUp, alreadyCredited: [...followUp.alreadyCredited, playerId] }) // room for a triple block
      }
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="follow-up" aria-label={title}>
      <p className="follow-up-title">{title}</p>
      <div className="follow-up-buttons">
        {candidates.map((p) => (
          <button
            key={p.id}
            className="button follow-up-button"
            type="button"
            aria-label={`#${p.number} ${p.name}`}
            onClick={() => pick(p.id)}
          >
            #{p.number}
          </button>
        ))}
        <button className="button" type="button" onClick={() => onChange(null)}>
          {firstBlocker || followUp.kind === 'assist' ? 'No one' : 'Done'}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

export default FollowUpStrip
