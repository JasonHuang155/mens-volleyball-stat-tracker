import type { MatchState } from '../domain/types.ts'

type Props = { state: MatchState; teamName: string; opponentName: string }

/** Sets won, the current set's score, and a dot by whoever is serving. */
function Scoreboard({ state, teamName, opponentName }: Props) {
  const current = state.sets[state.sets.length - 1] ?? { us: 0, them: 0 }
  const playing = state.status === 'playing'
  const label =
    state.setNumber === 0 ? 'Not started' : playing ? `Set ${state.setNumber}` : `Set ${state.setNumber} final`

  return (
    <section className="scoreboard" aria-label="Score">
      <p className="scoreboard-label">{label}</p>
      <ScoreRow name={teamName} sets={state.setsWon.us} points={current.us} serving={playing && state.servingTeam === 'us'} />
      <ScoreRow
        name={opponentName}
        sets={state.setsWon.them}
        points={current.them}
        serving={playing && state.servingTeam === 'them'}
      />
    </section>
  )
}

type RowProps = { name: string; sets: number; points: number; serving: boolean }

function ScoreRow({ name, sets, points, serving }: RowProps) {
  return (
    <div className="score-row">
      <span className="score-team">
        <span className={serving ? 'serve-dot' : 'serve-dot serve-dot-off'} aria-hidden="true" />
        {name}
        {serving && <span className="sr-only"> (serving)</span>}
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
