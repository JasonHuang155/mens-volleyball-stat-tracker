import { useState } from 'react'
import { errorMessage } from '../components/errorMessage.ts'
import { db } from '../db/database.ts'
import { recordTap, type MatchData } from '../db/matches.ts'
import { playerLabel } from '../db/roster.ts'
import { courtRow } from '../domain/replay.ts'
import type { MatchState, Side, SubstitutionBody } from '../domain/types.ts'

type Props = { data: MatchData; state: MatchState; onDone: () => void }

/** Pick a team, then make a libero swap (one tap) or a regular substitution. */
function SubPanel({ data, state, onDone }: Props) {
  const { match, teams, rosters } = data
  const [side, setSide] = useState<Side>('home')
  const [outId, setOutId] = useState('')
  const [inId, setInId] = useState('')
  const [error, setError] = useState('')

  const court = state.courts[side]
  const roster = rosters[side]
  const byId = new Map(roster.map((p) => [p.id, p]))
  const name = (id: string) => {
    const player = byId.get(id)
    return player ? playerLabel(player) : '?'
  }
  const liberoId = court.liberoId
  const replacedId = court.liberoReplacing // who the libero is in for, if they're on court
  const onCourt = court.lineup.filter((id) => id !== liberoId)
  const backRow = onCourt.filter((id) => courtRow(state, side, id) === 'back')
  const bench = roster.filter((p) => !court.lineup.includes(p.id) && p.id !== liberoId && p.id !== replacedId)

  function pickSide(next: Side) {
    setSide(next)
    setOutId('')
    setInId('')
    setError('')
  }

  async function save(playerIn: string, playerOut: string, kind: SubstitutionBody['detail']['kind']) {
    try {
      await recordTap(db, match, { type: 'substitution', side, playerId: playerIn, detail: { playerOutId: playerOut, kind } })
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="action-panel" aria-label="Subs">
      <div className="action-panel-title">
        <strong>Subs</strong>
        <button className="button button-small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>

      <fieldset className="segmented segmented-2">
        <legend>Team</legend>
        {(['away', 'home'] as const).map((s) => (
          <label key={s}>
            <input type="radio" name="sub-team" checked={side === s} onChange={() => pickSide(s)} />
            {teams[s].name}
          </label>
        ))}
      </fieldset>

      {liberoId && (
        <div className="action-group" role="group" aria-label="Libero">
          <span className="action-group-label">Libero ({name(liberoId)})</span>
          <div className="action-group-body action-buttons action-buttons-1">
            {replacedId ? (
              <button className="button" type="button" onClick={() => save(replacedId, liberoId, 'libero')}>
                Libero out, {name(replacedId)} back in
              </button>
            ) : (
              backRow.map((id) => (
                <button key={id} className="button" type="button" onClick={() => save(liberoId, id, 'libero')}>
                  Libero in for {name(id)}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <div className="player-form-row">
        <label className="field field-grow">
          Coming out
          <select value={outId} onChange={(e) => setOutId(e.target.value)}>
            <option value="">Pick</option>
            {onCourt.map((id) => (
              <option key={id} value={id}>
                {name(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-grow">
          Going in
          <select value={inId} onChange={(e) => setInId(e.target.value)}>
            <option value="">Pick</option>
            {bench.map((p) => (
              <option key={p.id} value={p.id}>
                {playerLabel(p)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="button button-primary"
        type="button"
        onClick={() => (outId && inId ? save(inId, outId, 'regular') : setError('Pick who comes out and who goes in'))}
      >
        Make sub
      </button>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

export default SubPanel
