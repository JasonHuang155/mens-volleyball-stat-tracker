/** "1 player", "12 players" */
export function playerCount(count: number): string {
  return `${count} ${count === 1 ? 'player' : 'players'}`
}
