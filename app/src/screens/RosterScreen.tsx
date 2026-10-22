import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import PlayerForm from '../components/PlayerForm.tsx'
import { playerCount } from '../components/playerCount.ts'
import { db } from '../db/database.ts'
import { addPlayer, deletePlayer, listPlayers, updatePlayer } from '../db/roster.ts'

function RosterScreen() {
  const { teamId = '' } = useParams() // the :teamId part of the address
  // null means "not found"; undefined means "still loading".
  const team = useLiveQuery(async () => (await db.teams.get(teamId)) ?? null, [teamId])
  const players = useLiveQuery(() => listPlayers(db, teamId), [teamId])
  const [editingId, setEditingId] = useState<string | null>(null)

  if (team === undefined || players === undefined) return null
  if (team === null) {
    return (
      <main className="screen">
        <h1>Team not found</h1>
        <Link className="button" to="/">
          Back to home
        </Link>
      </main>
    )
  }

  return (
    <main className="screen">
      <Link className="back-link" to="/">
        ‹ Home
      </Link>
      <h1>{team.name}</h1>
      <p className="muted">{playerCount(players.length)}</p>

      <section className="card">
        <h2>Add a player</h2>
        <PlayerForm
          label="Add a player"
          submitLabel="Add player"
          onSubmit={async (input) => {
            await addPlayer(db, teamId, input)
          }}
        />
      </section>

      <section>
        <h2>Roster</h2>
        {players.length === 0 && <p className="muted">No players yet.</p>}
        <ul className="roster" aria-label="Roster">
          {players.map((player) =>
            player.id === editingId ? (
              <li key={player.id} className="card">
                <PlayerForm
                  label={`Edit #${player.number} ${player.name}`}
                  submitLabel="Save"
                  initial={player}
                  onSubmit={async (input) => {
                    await updatePlayer(db, { ...player, ...input })
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                  onDelete={async () => {
                    await deletePlayer(db, player.id)
                    setEditingId(null)
                  }}
                />
              </li>
            ) : (
              <li key={player.id}>
                <button className="roster-row" type="button" onClick={() => setEditingId(player.id)}>
                  <span className="jersey">#{player.number}</span>
                  <span className="roster-name">{player.name}</span>
                  <span className="muted">{player.position}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      </section>
    </main>
  )
}

export default RosterScreen
