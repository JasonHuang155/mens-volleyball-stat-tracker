import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { errorMessage } from '../components/errorMessage.ts'
import { db } from '../db/database.ts'
import { createMatch } from '../db/matches.ts'
import { listTeams } from '../db/roster.ts'
import type { BestOf } from '../domain/types.ts'

function NewMatchScreen() {
  const teams = useLiveQuery(() => listTeams(db))
  const navigate = useNavigate()
  const [awayTeamId, setAwayTeamId] = useState('')
  const [homeTeamId, setHomeTeamId] = useState('')
  const [bestOf, setBestOf] = useState<BestOf>(5)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      const match = await createMatch(db, { homeTeamId, awayTeamId, bestOf })
      navigate(`/matches/${match.id}`) // go straight to the set 1 lineups
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (teams === undefined) return <p className="screen muted">Loading…</p>
  return (
    <main className="screen">
      <Link className="back-link" to="/">
        ‹ Home
      </Link>
      <h1>New match</h1>
      <form className="card" aria-label="New match" onSubmit={handleSubmit}>
        <div className="player-form-row">
          {(
            [
              ['Away team', awayTeamId, setAwayTeamId],
              ['Home team', homeTeamId, setHomeTeamId],
            ] as const
          ).map(([label, value, setValue]) => (
            <label key={label} className="field field-grow">
              {label}
              <select value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Pick</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <fieldset className="segmented segmented-2">
          <legend>Match length</legend>
          {([3, 5] as const).map((n) => (
            <label key={n}>
              <input type="radio" name="best-of" checked={bestOf === n} onChange={() => setBestOf(n)} />
              Best of {n}
            </label>
          ))}
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" type="submit">
          Create match
        </button>
      </form>
    </main>
  )
}

export default NewMatchScreen
