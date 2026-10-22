import { useState } from 'react'
import { errorMessage } from '../components/errorMessage.ts'
import { db } from '../db/database.ts'
import { recordTap } from '../db/matches.ts'
import { courtRow } from '../domain/replay.ts'
import type { Match, MatchState, Player, SubstitutionBody } from '../domain/types.ts'

type Props = { match: Match; players: Player[]; state: MatchState; onDone: () => void }

/** Libero swaps (one tap) and regular substitutions (pick who comes out and who goes in). */
function SubPanel({ match, players, state, onDone }: Props) {
  const [outId, setOutId] = useState('')
  const [inId, setInId] = useState('')
  const [error, setError] = useState('')

  const byId = new Map(players.map((p) => [p.id, p]))
  const name = (id: string) => `#${byId.get(id)?.number} ${byId.get(id)?.name}`
  const liberoId = state.liberoId
  const replacedId = state.liberoReplacing // who the libero is in for, if they're on court
  const libero = liberoId ? byId.get(liberoId) : undefined
  const onCourt = state.lineup.filter((id) => id !== liberoId)
  const backRow = onCourt.filter((id) => courtRow(state, id) === 'back')
  const bench = players.filter((p) => !state.lineup.includes(p.id) && p.id !== liberoId && p.id !== replacedId)

  async function save(playerIn: string, playerOut: string, kind: SubstitutionBody['detail']['kind']) {
    try {
      await recordTap(db, match, { type: 'substitution', playerId: playerIn, detail: { playerOutId: playerOut, kind } })
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="action-panel" aria-label="Subs">
      <div className="action-panel-title">
        <strong>Subs</strong>
        <button className="button" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>

      {libero && liberoId && (
        <div className="action-group" role="group" aria-label="Libero">
          <span className="action-group-label">Libero (#{libero.number})</span>
          <div className="action-buttons action-buttons-1">
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

      <div className="action-group" role="group" aria-label="Substitution">
        <span className="action-group-label">Substitution</span>
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
                  #{p.number} {p.name}
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
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

export default SubPanel
