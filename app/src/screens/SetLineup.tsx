import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import Court from '../components/Court.tsx'
import { errorMessage } from '../components/errorMessage.ts'
import { db } from '../db/database.ts'
import { recordTap } from '../db/matches.ts'
import { isDecidingSet } from '../domain/rules.ts'
import type { Match, MatchEvent, MatchState, Player, SetStartBody, Side } from '../domain/types.ts'
import { activeEvents } from '../domain/undo.ts'

type Props = {
  match: Match
  teamName: string
  players: Player[]
  events: MatchEvent[]
  state: MatchState
}

/** Shown before every set: who starts where, the setter, the libero, and who serves first. */
function SetLineup({ match, teamName, players, events, state }: Props) {
  const setNumber = state.setNumber + 1
  // From set 2 on, start from the last set's lineup, with the other team serving first.
  const previous = lastSetStart(events)
  const [lineup, setLineup] = useState<string[]>(previous ? [...previous.lineup] : ['', '', '', '', '', ''])
  const [liberoId, setLiberoId] = useState(
    previous ? (previous.liberoId ?? '') : (players.find((p) => p.position === 'L')?.id ?? ''),
  )
  const [setterChoice, setSetterChoice] = useState(previous?.setterId ?? '')
  const [firstServe, setFirstServe] = useState<Side | null>(previous ? otherSide(previous.firstServe) : null)
  const [error, setError] = useState('')

  const byId = new Map(players.map((p) => [p.id, p]))
  // Use the chosen setter if they're in the lineup; otherwise guess the player listed as S.
  const setterId = lineup.includes(setterChoice)
    ? setterChoice
    : (lineup.find((id) => byId.get(id)?.position === 'S') ?? '')

  function choose(index: number, playerId: string) {
    setLineup(lineup.map((id, i) => (i === index ? playerId : id)))
  }

  /** Players who can go in this spot: anyone not already placed elsewhere, except the libero. */
  function optionsFor(index: number) {
    return players.filter((p) => p.id !== liberoId && (lineup[index] === p.id || !lineup.includes(p.id)))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (lineup.some((id) => !id)) return setError('Pick a player for every position')
    if (!setterId) return setError('Pick the setter')
    if (!firstServe) return setError('Choose who serves first')
    try {
      await recordTap(db, match, {
        type: 'set_start',
        detail: { lineup, setterId, liberoId: liberoId || null, firstServe },
      })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="card" aria-label={`Set ${setNumber} lineup`} onSubmit={handleSubmit}>
      <h2>Set {setNumber} lineup</h2>
      {isDecidingSet(setNumber, match.bestOf) && <p className="muted">Deciding set: first to 15</p>}
      {players.length < 6 && (
        <p className="form-error">
          You need at least 6 players. <Link to={`/teams/${match.teamId}`}>Add players to the roster</Link>
        </p>
      )}

      <Court
        renderSlot={(position) => (
          <label className="court-pick">
            <span className="court-position">Position {position}</span>
            <select value={lineup[position - 1]} onChange={(e) => choose(position - 1, e.target.value)}>
              <option value="">Pick</option>
              {optionsFor(position - 1).map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      />
      <p className="muted">Position 1 is right back: they serve first when we serve.</p>

      <div className="player-form-row">
        <label className="field field-grow">
          Setter
          <select value={setterId} onChange={(e) => setSetterChoice(e.target.value)}>
            <option value="">Pick</option>
            {lineup
              .filter((id) => id)
              .map((id) => (
                <option key={id} value={id}>
                  #{byId.get(id)?.number} {byId.get(id)?.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field field-grow">
          Libero
          <select value={liberoId} onChange={(e) => setLiberoId(e.target.value)}>
            <option value="">No libero</option>
            {players
              .filter((p) => !lineup.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <fieldset className="segmented segmented-2">
        <legend>First serve</legend>
        {(['us', 'them'] as const).map((side) => (
          <label key={side}>
            <input type="radio" name="first-serve" checked={firstServe === side} onChange={() => setFirstServe(side)} />
            {side === 'us' ? teamName : match.opponentName}
          </label>
        ))}
      </fieldset>

      {setterId && <p className="muted">Starts in rotation {lineup.indexOf(setterId) + 1}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-primary" type="submit">
        Start set {setNumber}
      </button>
    </form>
  )
}

function lastSetStart(events: MatchEvent[]): SetStartBody['detail'] | null {
  const starts = activeEvents(events).filter((e) => e.type === 'set_start')
  const last = starts[starts.length - 1]
  return last?.type === 'set_start' ? last.detail : null
}

function otherSide(side: Side): Side {
  return side === 'us' ? 'them' : 'us'
}

export default SetLineup
