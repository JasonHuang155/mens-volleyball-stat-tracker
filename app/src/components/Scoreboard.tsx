import type { MatchState, Side } from '../domain/types.ts'

type Props = {
  state: MatchState
  teamNames: Record<Side, string>
  /** Smaller, for the tap screen, where every bit of height counts. */
  compact?: boolean
}

/**
 * Sets won, the current set's score, and a dot by whoever is serving.
 * Away is on top, matching the tap screen (away court at the top).
 */
function Scoreboard({ state, teamNames, compact = false }: Props) {
  const current = state.sets[state.sets.length - 1] ?? { home: 0, away: 0 }
  const playing = state.status === 'playing'
  const label =
    state.setNumber === 0 ? 'Not started' : playing ? `Set ${state.setNumber}` : `Set ${state.setNumber} final`

  return (
    <section className={compact ? 'scoreboard scoreboard-compact' : 'scoreboard'} aria-label="Score">
      <p className="scoreboard-label">{label}</p>
      {(['away', 'home'] as const).map((side) => (
        <ScoreRow
          key={side}
          side={side}
          name={teamNames[side]}
          sets={state.setsWon[side]}
          points={current[side]}
          serving={playing && state.servingSide === side}
          rotation={playing ? state.courts[side].rotation : null}
        />
      ))}
    </section>
  )
}

type RowProps = { side: Side; name: string; sets: number; points: number; serving: boolean; rotation: number | null }

function ScoreRow({ side, name, sets, points, serving, rotation }: RowProps) {
  return (
    <div className={`score-row side-${side}`}>
      <span className="score-team">
        <span className={serving ? 'serve-dot' : 'serve-dot serve-dot-off'} aria-hidden="true" />
        <span className="score-name">{name}</span>
        {serving && <span className="sr-only"> (serving)</span>}
        {rotation !== null && <span className="score-rotation">Rot {rotation}</span>}
      </span>
      <span className="score-sets">
        {sets}
        <span className="sr-only"> sets</span>
      </span>
      <span className="score-points">{points}</span>
    </div>
  )
}

export default Scoreboard
