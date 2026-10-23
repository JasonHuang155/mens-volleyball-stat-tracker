import { recordAction, recordFollowUp, recordUndo } from '../domain/record.ts'
import { replay } from '../domain/replay.ts'
import type { BestOf, EventBody, Lineup, MatchEvent, Side, StatBody } from '../domain/types.ts'

/** The home team: p1 starts in position 1 (serving), p2 in position 2, ... p6 in position 6. */
export const HOME = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
/** The away team: a1 in position 1, ... a6 in position 6. */
export const AWAY = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']

type SetOptions = { firstServe?: Side; home?: Partial<Lineup>; away?: Partial<Lineup> }

/**
 * Plays out a match in tests the same way the app will: every tap goes
 * through recordAction, so the rules are checked and events are stamped.
 *
 *   const match = new MatchScript().startSet().point('home', 3)
 *   expect(match.state().sets[0].home).toBe(3)
 */
export class MatchScript {
  events: MatchEvent[] = []
  private match: { id: string; bestOf: BestOf }

  constructor(bestOf: BestOf = 5) {
    this.match = { id: 'match-1', bestOf }
  }

  state() {
    return replay(this.match, this.events)
  }

  last(): MatchEvent {
    return this.events[this.events.length - 1]
  }

  record(body: EventBody): this {
    this.events = [...this.events, recordAction(this.match, this.events, body)]
    return this
  }

  followUp(body: StatBody): this {
    this.events = [...this.events, recordFollowUp(this.match, this.events, body)]
    return this
  }

  undo(): this {
    const event = recordUndo(this.match, this.events)
    if (event) this.events = [...this.events, event]
    return this
  }

  /**
   * Starts a set: HOME and AWAY lineups, p1 and a1 as setters, no liberos,
   * home serving first, unless told otherwise.
   */
  startSet(options: SetOptions = {}): this {
    return this.record({
      type: 'set_start',
      detail: {
        home: { players: HOME, setterId: 'p1', liberoId: null, ...options.home },
        away: { players: AWAY, setterId: 'a1', liberoId: null, ...options.away },
        firstServe: options.firstServe ?? 'home',
      },
    })
  }

  /** Gives a team points with no player stat (a "point, no stat" tap). */
  point(side: Side, count = 1): this {
    for (let i = 0; i < count; i++) this.record({ type: 'point', side })
    return this
  }

  kill(playerId: string, side: Side = 'home'): this {
    return this.record({ type: 'attack', side, playerId, result: 'kill', detail: { row: 'front' } })
  }

  sub(playerIn: string, playerOut: string, side: Side = 'home'): this {
    return this.record({
      type: 'substitution',
      side,
      playerId: playerIn,
      detail: { playerOutId: playerOut, kind: 'regular' },
    })
  }

  liberoSwap(playerIn: string, playerOut: string, side: Side = 'home'): this {
    return this.record({
      type: 'substitution',
      side,
      playerId: playerIn,
      detail: { playerOutId: playerOut, kind: 'libero' },
    })
  }

  /** From 0-0, plays the set to this final score. The loser's points go first so the set can't end early. */
  playSetTo(home: number, away: number): this {
    return home > away ? this.point('away', away).point('home', home) : this.point('home', home).point('away', away)
  }
}
