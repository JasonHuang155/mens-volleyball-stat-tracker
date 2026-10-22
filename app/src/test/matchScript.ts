import { recordAction, recordFollowUp, recordUndo } from '../domain/record.ts'
import { replay } from '../domain/replay.ts'
import type { BestOf, EventBody, FollowUpBody, MatchEvent, SetStartBody, Side } from '../domain/types.ts'

/** p1 starts in position 1 (serving), p2 in position 2, ... p6 in position 6. */
export const LINEUP = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']

/**
 * Plays out a match in tests the same way the app will: every tap goes
 * through recordAction, so the rules are checked and events are stamped.
 *
 *   const match = new MatchScript().startSet().point('us', 3)
 *   expect(match.state().sets[0].us).toBe(3)
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

  followUp(body: FollowUpBody): this {
    this.events = [...this.events, recordFollowUp(this.match, this.events, body)]
    return this
  }

  undo(): this {
    const event = recordUndo(this.match, this.events)
    if (event) this.events = [...this.events, event]
    return this
  }

  kill(playerId: string): this {
    return this.record({ type: 'attack', playerId, result: 'kill', detail: { row: 'front' } })
  }

  /** Starts a set with LINEUP, p1 as setter, no libero, and us serving, unless told otherwise. */
  startSet(detail: Partial<SetStartBody['detail']> = {}): this {
    return this.record({
      type: 'set_start',
      detail: { lineup: LINEUP, setterId: 'p1', liberoId: null, firstServe: 'us', ...detail },
    })
  }

  /** Gives a team points without crediting a player: "their error" for us, "their point" for them. */
  point(side: Side, count = 1): this {
    for (let i = 0; i < count; i++) {
      this.record(side === 'us' ? { type: 'their_error' } : { type: 'their_point' })
    }
    return this
  }

  sub(playerIn: string, playerOut: string): this {
    return this.record({ type: 'substitution', playerId: playerIn, detail: { playerOutId: playerOut, kind: 'regular' } })
  }

  liberoSwap(playerIn: string, playerOut: string): this {
    return this.record({ type: 'substitution', playerId: playerIn, detail: { playerOutId: playerOut, kind: 'libero' } })
  }

  /** From 0-0, plays the set to this final score. The loser's points go first so the set can't end early. */
  playSetTo(us: number, them: number): this {
    return us > them ? this.point('them', them).point('us', us) : this.point('us', us).point('them', them)
  }
}
