import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import Court from '../components/Court.tsx'
import { errorMessage } from '../components/errorMessage.ts'
import { db } from '../db/database.ts'
import { recordTap, type MatchData } from '../db/matches.ts'
import { playerLabel } from '../db/roster.ts'
import { isDecidingSet, otherSide } from '../domain/rules.ts'
import type { Lineup, MatchEvent, MatchState, Player, SetStartBody, Side } from '../domain/types.ts'
import { activeEvents } from '../domain/undo.ts'

type Props = { data: MatchData; state: MatchState }

/** One team's lineup while it's being filled in. Empty strings are spots not picked yet. */
type Draft = { players: string[]; setterChoice: string; liberoId: string }

const SIDES: Side[] = ['away', 'home']

/** Shown before every set: both teams' starting six, setters, liberos, and who serves first. */
function SetLineup({ data, state }: Props) {
  const { match, teams, rosters, events } = data
  const setNumber = state.setNumber + 1
  // From set 2 on, start from the last set's lineups, with the other team serving first.
  const previous = lastSetStart(events)
  const [drafts, setDrafts] = useState<Record<Side, Draft>>(() => ({
    home: startingDraft(previous?.home, rosters.home),
    away: startingDraft(previous?.away, rosters.away),
  }))
  const [firstServe, setFirstServe] = useState<Side | null>(previous ? otherSide(previous.firstServe) : null)
  const [error, setError] = useState('')

  function update(side: Side, change: Partial<Draft>) {
    setDrafts({ ...drafts, [side]: { ...drafts[side], ...change } })
  }

  /** The finished lineup for one team, or what's still missing. */
  function lineupFor(side: Side): Lineup | string {
    const draft = drafts[side]
    const setterId = effectiveSetter(draft, rosters[side])
    if (draft.players.some((id) => !id)) return `Pick a player for every ${teams[side].name} position`
    if (!setterId) return `Pick the ${teams[side].name} setter`
    return { players: draft.players, setterId, liberoId: draft.liberoId || null }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const away = lineupFor('away')
    if (typeof away === 'string') return setError(away)
    const home = lineupFor('home')
    if (typeof home === 'string') return setError(home)
    if (!firstServe) return setError('Choose who serves first')
    try {
      await recordTap(db, match, { type: 'set_start', detail: { home, away, firstServe } })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="card" aria-label={`Set ${setNumber} lineups`} onSubmit={handleSubmit}>
      <h2>Set {setNumber} lineups</h2>
      {isDecidingSet(setNumber, match.bestOf) && <p className="muted">Deciding set: first to 15</p>}

      {SIDES.map((side) => (
        <TeamLineup
          key={side}
          teamName={teams[side].name}
          teamId={teams[side].id}
          roster={rosters[side]}
          draft={drafts[side]}
          onChange={(change) => update(side, change)}
        />
      ))}

      <fieldset className="segmented segmented-2">
        <legend>First serve</legend>
        {SIDES.map((side) => (
          <label key={side}>
            <input type="radio" name="first-serve" checked={firstServe === side} onChange={() => setFirstServe(side)} />
            {teams[side].name}
          </label>
        ))}
      </fieldset>

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

type TeamLineupProps = {
  teamName: string
  teamId: string
  roster: Player[]
  draft: Draft
  onChange: (change: Partial<Draft>) => void
}

function TeamLineup({ teamName, teamId, roster, draft, onChange }: TeamLineupProps) {
  const byId = new Map(roster.map((p) => [p.id, p]))
  const setterId = effectiveSetter(draft, roster)

  /** Players who can go in this spot: anyone not already placed elsewhere, except the libero. */
  function optionsFor(index: number) {
    return roster.filter((p) => p.id !== draft.liberoId && (draft.players[index] === p.id || !draft.players.includes(p.id)))
  }

  return (
    <fieldset className="team-lineup" aria-label={`${teamName} lineup`}>
      <legend>{teamName}</legend>
      {roster.length < 6 && (
        <p className="form-error">
          {teamName} needs at least 6 players. <Link to={`/teams/${teamId}`}>Add players to the roster</Link>
        </p>
      )}
      <Court
        renderSlot={(position) => (
          <label className="court-pick">
            <span className="court-position">Position {position}</span>
            <select
              value={draft.players[position - 1]}
              onChange={(e) => onChange({ players: draft.players.map((id, i) => (i === position - 1 ? e.target.value : id)) })}
            >
              <option value="">Pick</option>
              {optionsFor(position - 1).map((p) => (
                <option key={p.id} value={p.id}>
                  {playerLabel(p)}
                </option>
              ))}
            </select>
          </label>
        )}
      />
      <div className="player-form-row">
        <label className="field field-grow">
          Setter
          <select value={setterId} onChange={(e) => onChange({ setterChoice: e.target.value })}>
            <option value="">Pick</option>
            {draft.players
              .map((id) => byId.get(id))
              .filter((p): p is Player => p !== undefined)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {playerLabel(p)}
                </option>
              ))}
          </select>
        </label>
        <label className="field field-grow">
          Libero
          <select value={draft.liberoId} onChange={(e) => onChange({ liberoId: e.target.value })}>
            <option value="">No libero</option>
            {roster
              .filter((p) => !draft.players.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {playerLabel(p)}
                </option>
              ))}
          </select>
        </label>
      </div>
      {setterId && <p className="muted">Starts in rotation {draft.players.indexOf(setterId) + 1}</p>}
    </fieldset>
  )
}

/** A new set's starting point: last set's lineup if there was one, otherwise empty with the libero guessed. */
function startingDraft(previous: Lineup | undefined, roster: Player[]): Draft {
  if (previous) return { players: [...previous.players], setterChoice: previous.setterId, liberoId: previous.liberoId ?? '' }
  return { players: ['', '', '', '', '', ''], setterChoice: '', liberoId: roster.find((p) => p.position === 'L')?.id ?? '' }
}

/** The chosen setter if they're in the lineup; otherwise a guess: the player listed as S. */
function effectiveSetter(draft: Draft, roster: Player[]): string {
  if (draft.players.includes(draft.setterChoice)) return draft.setterChoice
  const byId = new Map(roster.map((p) => [p.id, p]))
  return draft.players.find((id) => byId.get(id)?.position === 'S') ?? ''
}

function lastSetStart(events: MatchEvent[]): SetStartBody['detail'] | null {
  const starts = activeEvents(events).filter((e) => e.type === 'set_start')
  const last = starts[starts.length - 1]
  return last?.type === 'set_start' ? last.detail : null
}

export default SetLineup
