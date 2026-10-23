import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { errorMessage } from '../components/errorMessage.ts'
import { matchSummary } from '../components/matchSummary.ts'
import { playerCount } from '../components/playerCount.ts'
import { db } from '../db/database.ts'
import { getEvents, listMatches } from '../db/matches.ts'
import { createTeam, listTeams } from '../db/roster.ts'
import { replay } from '../domain/replay.ts'

// useLiveQuery reads from the database and re-reads whenever the data changes,
// so the screen always shows what's saved. It returns undefined while loading.

function HomeScreen() {
  const teams = useLiveQuery(async () => {
    const all = await listTeams(db)
    return Promise.all(all.map(async (team) => ({ team, players: await db.players.where('teamId').equals(team.id).count() })))
  })
  if (teams === undefined) return <p className="screen muted">Loading…</p>

  return (
    <main className="screen">
      <h1>Volleyball Stat Tracker</h1>

      <section className="card" aria-label="Teams">
        <h2>Teams</h2>
        {teams.length === 0 && (
          <p className="muted">Add your team and the teams you play. Each team has its own roster.</p>
        )}
        {teams.length > 0 && (
          <ul className="match-list" aria-label="Team list">
            {teams.map(({ team, players }) => (
              <li key={team.id}>
                <Link className="match-row" to={`/teams/${team.id}`}>
                  <span className="match-opponent">{team.name}</span>
                  <span className="muted">{playerCount(players)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <AddTeamForm />
      </section>

      {teams.length >= 2 ? (
        <Link className="button button-primary" to="/new-match">
          New match
        </Link>
      ) : (
        <p className="muted">Add at least two teams to start a match.</p>
      )}
      <MatchList />
    </main>
  )
}

function MatchList() {
  // Each match's standing is worked out by replaying its events.
  const matches = useLiveQuery(async () => {
    const all = await listMatches(db)
    return Promise.all(
      all.map(async (match) => {
        const [home, away, events] = await Promise.all([
          db.teams.get(match.homeTeamId),
          db.teams.get(match.awayTeamId),
          getEvents(db, match.id),
        ])
        const names = { home: home?.name ?? 'Home', away: away?.name ?? 'Away' }
        return { match, names, state: replay(match, events) }
      }),
    )
  })
  if (matches === undefined || matches.length === 0) return null

  return (
    <section>
      <h2>Matches</h2>
      <ul className="match-list" aria-label="Matches">
        {matches.map(({ match, names, state }) => (
          <li key={match.id}>
            <Link className="match-row" to={`/matches/${match.id}`}>
              <span className="match-opponent">
                {names.away} at {names.home}
              </span>
              <span className="muted">{matchSummary(state, names)}</span>
              <span className="muted match-date">{new Date(match.createdAt).toLocaleDateString()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AddTeamForm() {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault() // stop the browser from reloading the page
    try {
      await createTeam(db, name)
      setName('')
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="player-form" aria-label="Add a team" onSubmit={handleSubmit}>
      <div className="player-form-row">
        <label className="field field-grow">
          Team name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button" type="submit">
        Add team
      </button>
    </form>
  )
}

export default HomeScreen
