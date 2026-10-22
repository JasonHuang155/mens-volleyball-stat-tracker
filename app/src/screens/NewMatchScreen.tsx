import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { errorMessage } from '../components/errorMessage.ts'
import { db } from '../db/database.ts'
import { createMatch } from '../db/matches.ts'
import type { BestOf } from '../domain/types.ts'

function NewMatchScreen() {
  const { teamId = '' } = useParams()
  const team = useLiveQuery(async () => (await db.teams.get(teamId)) ?? null, [teamId])
  const navigate = useNavigate()
  const [opponentName, setOpponentName] = useState('')
  const [bestOf, setBestOf] = useState<BestOf>(5)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      const match = await createMatch(db, { teamId, opponentName, bestOf })
      navigate(`/matches/${match.id}`) // go straight to the set 1 lineup
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (team === undefined) return null
  return (
    <main className="screen">
      <Link className="back-link" to="/">
        ‹ Home
      </Link>
      <h1>New match</h1>
      <form className="card" aria-label="New match" onSubmit={handleSubmit}>
        {team && <p className="muted">{team.name} vs</p>}
        <label className="field">
          Opponent
          <input type="text" value={opponentName} onChange={(e) => setOpponentName(e.target.value)} />
        </label>

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
