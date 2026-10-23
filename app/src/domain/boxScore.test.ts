import { describe, expect, it } from 'vitest'
import { MatchScript } from '../test/matchScript.ts'
import {
  buildBoxScore,
  hittingPercentage,
  passAverage,
  points,
  setsPlayed,
  teamTotals,
  totalBlocks,
} from './boxScore.ts'
import type { AttackBody, Player, ServeBody } from './types.ts'
import { activeEvents } from './undo.ts'

// The roster for these tests. p1-p6 start (p1 is the setter, in position 1),
// p7 is on the bench, and L is the libero.
const players: Player[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'L'].map((id, i) => ({
  id,
  teamId: 'team-1',
  name: `Player ${id}`,
  number: i + 1,
  position: id === 'p1' ? 'S' : id === 'L' ? 'L' : 'OH',
}))

const attack = (playerId: string, result: AttackBody['result']): AttackBody => ({
  type: 'attack',
  playerId,
  result,
  detail: { row: 'front' },
})

// p1 is always our server in these tests.
const serve = (result: ServeBody['result']): ServeBody => ({
  type: 'serve',
  playerId: 'p1',
  result,
  detail: { serveType: 'jump_float' },
})

function boxScore(match: MatchScript) {
  return buildBoxScore(activeEvents(match.events), players)
}

function lineFor(match: MatchScript, playerId: string) {
  const line = boxScore(match).find((l) => l.playerId === playerId)
  if (!line) throw new Error(`the box score has no line for ${playerId}`)
  return line
}

describe('hittingPercentage', () => {
  it('is (kills - errors) / attempts', () => {
    expect(hittingPercentage(10, 2, 24)).toBeCloseTo(0.333, 3)
    expect(hittingPercentage(5, 0, 5)).toBe(1)
    expect(hittingPercentage(0, 0, 4)).toBe(0)
  })

  it('can be negative', () => {
    expect(hittingPercentage(1, 3, 10)).toBeCloseTo(-0.2)
  })

  it('is null with no attempts', () => {
    expect(hittingPercentage(0, 0, 0)).toBe(null)
  })
})

describe('passAverage', () => {
  it('averages the ratings', () => {
    expect(passAverage([3, 2, 2, 1])).toBe(2)
    expect(passAverage([0, 3])).toBe(1.5)
    expect(passAverage([2, 2, 3])).toBeCloseTo(2.333, 3)
  })

  it('is null with no passes', () => {
    expect(passAverage([])).toBe(null)
  })
})

describe('totalBlocks', () => {
  it('counts a block assist as half a block', () => {
    expect(totalBlocks(2, 0)).toBe(2)
    expect(totalBlocks(0, 3)).toBe(1.5)
    expect(totalBlocks(1, 2)).toBe(2)
    expect(totalBlocks(0, 0)).toBe(0)
  })
})

describe('points', () => {
  it('adds kills, aces, solo blocks, and half of block assists', () => {
    expect(points(10, 2, 1, 3)).toBe(14.5)
    expect(points(0, 0, 0, 1)).toBe(0.5)
    expect(points(0, 0, 0, 0)).toBe(0)
  })
})

describe('setsPlayed', () => {
  it('counts each set a player starts', () => {
    const match = new MatchScript().startSet().playSetTo(25, 20).startSet()
    expect(setsPlayed(activeEvents(match.events), 'p1')).toBe(2)
  })

  it('is 0 for a player who never comes in', () => {
    const match = new MatchScript().startSet()
    expect(setsPlayed(activeEvents(match.events), 'p7')).toBe(0)
  })

  it('counts a set where the player comes in as a sub', () => {
    const match = new MatchScript().startSet().playSetTo(25, 20).startSet().sub('p7', 'p4')
    expect(setsPlayed(activeEvents(match.events), 'p7')).toBe(1)
    expect(setsPlayed(activeEvents(match.events), 'p4')).toBe(2)
  })

  it('counts the libero only in sets where they come on court', () => {
    const match = new MatchScript()
      .startSet({ liberoId: 'L' })
      .liberoSwap('L', 'p5')
      .playSetTo(25, 20)
      .startSet({ liberoId: 'L' })
    expect(setsPlayed(activeEvents(match.events), 'L')).toBe(1)
  })

  it('counts a set once even if the player comes in twice', () => {
    const match = new MatchScript().startSet().sub('p7', 'p4').sub('p4', 'p7').sub('p7', 'p4')
    expect(setsPlayed(activeEvents(match.events), 'p7')).toBe(1)
  })
})

describe('buildBoxScore', () => {
  it('has one line per player, in roster order', () => {
    const lines = boxScore(new MatchScript().startSet())
    expect(lines.map((l) => l.playerId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'L'])
  })

  it('gives a player who did nothing a line of zeros', () => {
    expect(lineFor(new MatchScript().startSet(), 'p7')).toEqual({
      playerId: 'p7',
      setsPlayed: 0,
      kills: 0,
      attackErrors: 0,
      totalAttacks: 0,
      hittingPercentage: null,
      assists: 0,
      serviceAces: 0,
      serviceErrors: 0,
      receptionAttempts: 0,
      receptionErrors: 0,
      passAverage: null,
      digs: 0,
      blockSolos: 0,
      blockAssists: 0,
      totalBlocks: 0,
      blockErrors: 0,
      ballHandlingErrors: 0,
      points: 0,
    })
  })

  it('counts attacks and works out hitting percentage', () => {
    const match = new MatchScript()
      .startSet()
      .record(attack('p4', 'kill'))
      .record(attack('p4', 'in_play'))
      .record(attack('p4', 'error'))
      .record(attack('p4', 'kill'))
    expect(lineFor(match, 'p4')).toMatchObject({
      kills: 2,
      attackErrors: 1,
      totalAttacks: 4,
      hittingPercentage: 0.25, // (2 - 1) / 4
    })
  })

  it('counts service aces and errors (a serve that lands in is neither)', () => {
    const match = new MatchScript()
      .startSet()
      .record(serve('ace'))
      .record(serve('in'))
      .point('us')
      .record(serve('error'))
    expect(lineFor(match, 'p1')).toMatchObject({ serviceAces: 1, serviceErrors: 1 })
  })

  it('counts passes, reception errors, and pass average', () => {
    const match = new MatchScript()
      .startSet({ firstServe: 'them' })
      .record({ type: 'pass', playerId: 'p5', result: 3 })
      .point('them')
      .record({ type: 'pass', playerId: 'p6', result: 0 }) // aced
      .record({ type: 'pass', playerId: 'p5', result: 2 })
      .record(attack('p4', 'kill'))
    expect(lineFor(match, 'p5')).toMatchObject({ receptionAttempts: 2, receptionErrors: 0, passAverage: 2.5 })
    expect(lineFor(match, 'p6')).toMatchObject({ receptionAttempts: 1, receptionErrors: 1, passAverage: 0 })
  })

  it('counts digs, assists, and ball handling errors', () => {
    const match = new MatchScript()
      .startSet()
      .record({ type: 'dig', playerId: 'p5' })
      .kill('p4')
      .followUp({ type: 'assist', playerId: 'p1' })
      .record({ type: 'ball_handling_error', playerId: 'p1' })
    expect(lineFor(match, 'p5')).toMatchObject({ digs: 1 })
    expect(lineFor(match, 'p1')).toMatchObject({ assists: 1, ballHandlingErrors: 1 })
  })

  it('counts solo blocks, block assists for every blocker, and block errors', () => {
    const match = new MatchScript()
      .startSet()
      .record({ type: 'block', playerId: 'p3', result: 'solo' })
      .record({ type: 'block', playerId: 'p2', result: 'assist' })
      .followUp({ type: 'block', playerId: 'p3', result: 'assist' })
      .record({ type: 'block', playerId: 'p4', result: 'error' })
    expect(lineFor(match, 'p3')).toMatchObject({ blockSolos: 1, blockAssists: 1, totalBlocks: 1.5 })
    expect(lineFor(match, 'p2')).toMatchObject({ blockSolos: 0, blockAssists: 1, totalBlocks: 0.5 })
    expect(lineFor(match, 'p4')).toMatchObject({ blockErrors: 1 })
  })

  it('works out NCAA points', () => {
    const match = new MatchScript()
      .startSet()
      .record(serve('ace'))
      .kill('p4')
      .kill('p4')
      .record({ type: 'block', playerId: 'p3', result: 'solo' })
      .record({ type: 'block', playerId: 'p3', result: 'assist' })
      .followUp({ type: 'block', playerId: 'p2', result: 'assist' })
    expect(lineFor(match, 'p1').points).toBe(1)
    expect(lineFor(match, 'p4').points).toBe(2)
    expect(lineFor(match, 'p3').points).toBe(1.5)
    expect(lineFor(match, 'p2').points).toBe(0.5)
  })

  it('fills in sets played', () => {
    const match = new MatchScript().startSet().playSetTo(25, 20).startSet()
    expect(lineFor(match, 'p1').setsPlayed).toBe(2)
    expect(lineFor(match, 'p7').setsPlayed).toBe(0)
  })

  it('gives no player credit for "their point" or "their error"', () => {
    const lines = boxScore(new MatchScript().startSet().point('us').point('them'))
    expect(lines).toHaveLength(players.length)
    for (const line of lines) {
      expect(line).toMatchObject({ kills: 0, attackErrors: 0, serviceAces: 0, serviceErrors: 0, points: 0 })
    }
  })

  it('leaves out undone plays (activeEvents removes them before they get here)', () => {
    const match = new MatchScript().startSet().kill('p4').undo()
    expect(lineFor(match, 'p4').kills).toBe(0)
  })
})

describe('teamTotals', () => {
  it('adds up the counts', () => {
    const match = new MatchScript()
      .startSet()
      .kill('p4')
      .kill('p2')
      .record({ type: 'block', playerId: 'p3', result: 'assist' })
      .followUp({ type: 'block', playerId: 'p2', result: 'assist' })
    const team = teamTotals(boxScore(match), 1)
    expect(team).toMatchObject({ playerId: 'team', setsPlayed: 1, kills: 2, blockAssists: 2, totalBlocks: 1, points: 3 })
  })

  it('works hitting percentage out from the totals instead of averaging players', () => {
    const match = new MatchScript()
      .startSet()
      .record(attack('p4', 'kill'))
      .record(attack('p4', 'in_play'))
      .record(attack('p4', 'error'))
      .record(attack('p4', 'in_play')) // p4: (1 - 1) / 4 = .000
      .record(attack('p2', 'kill')) // p2: 1 / 1 = 1.000
    // Averaging the two players would give .500. The team really hit (2 - 1) / 5 = .200.
    expect(teamTotals(boxScore(match), 1).hittingPercentage).toBeCloseTo(0.2)
  })

  it('weights the pass average by how many passes each player had', () => {
    const match = new MatchScript()
      .startSet({ firstServe: 'them' })
      .record({ type: 'pass', playerId: 'p5', result: 3 })
      .record({ type: 'pass', playerId: 'p5', result: 3 })
      .record({ type: 'pass', playerId: 'p5', result: 3 })
      .record({ type: 'pass', playerId: 'p6', result: 1 })
    // p5 averages 3 and p6 averages 1, but p5 had 3 of the 4 passes: (3 + 3 + 3 + 1) / 4 = 2.5
    expect(teamTotals(boxScore(match), 1).passAverage).toBeCloseTo(2.5)
  })

  it('has no percentages when nobody attacked or passed', () => {
    const team = teamTotals(boxScore(new MatchScript().startSet()), 1)
    expect(team.hittingPercentage).toBe(null)
    expect(team.passAverage).toBe(null)
  })
})
