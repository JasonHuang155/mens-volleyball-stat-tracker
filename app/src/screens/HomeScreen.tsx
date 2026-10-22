import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { errorMessage } from '../components/errorMessage.ts'
import { playerCount } from '../components/playerCount.ts'
import { db } from '../db/database.ts'
import { createTeam, listPlayers, listTeams } from '../db/roster.ts'
import type { Team } from '../domain/types.ts'

// useLiveQuery reads from the database and re-reads whenever the data changes,
// so the screen always shows what's saved. It returns undefined while loading.

function HomeScreen() {
  const teams = useLiveQuery(() => listTeams(db))
  if (teams === undefined) return null

  // Phase 1 manages one team. The database can already hold more.
  const team = teams[0]
  return (
    <main className="screen">
      <h1>Volleyball Stat Tracker</h1>
      {team ? <TeamCard team={team} /> : <CreateTeamForm />}
    </main>
  )
}

function TeamCard({ team }: { team: Team }) {
  const players = useLiveQuery(() => listPlayers(db, team.id), [team.id])
  return (
    <section className="card">
      <h2>{team.name}</h2>
      <p className="muted">{players === undefined ? '' : playerCount(players.length)}</p>
      <Link className="button" to={`/teams/${team.id}`}>
        Roster
      </Link>
    </section>
  )
}

function CreateTeamForm() {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault() // stop the browser from reloading the page
    try {
      await createTeam(db, name)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form className="card" aria-label="Create your team" onSubmit={handleSubmit}>
      <h2>Create your team</h2>
      <label className="field">
        Team name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-primary" type="submit">
        Create team
      </button>
    </form>
  )
}

export default HomeScreen
