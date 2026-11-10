import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDelay, previews, Rating, schedule } from '../src/services/srs.js';
import { DAY, MINUTE } from '../src/utils/time.js';

const NOW = 1_700_000_000_000;
const newCard = { interval: 0, ease: 2.5, reps: 0, lapses: 0 };

describe('schedule', () => {
  it('sends a forgotten card back in 10 minutes and lowers its ease', () => {
    const s = schedule({ ...newCard, reps: 3, interval: 10 }, Rating.AGAIN, NOW);
    assert.equal(s.due, NOW + 10 * MINUTE);
    assert.equal(s.reps, 0);
    assert.equal(s.lapses, 1);
    assert.equal(s.ease, 2.3);
  });

  it('uses fixed first intervals for new cards', () => {
    assert.equal(schedule(newCard, Rating.HARD, NOW).interval, 0.5);
    assert.equal(schedule(newCard, Rating.GOOD, NOW).interval, 1);
    assert.equal(schedule(newCard, Rating.EASY, NOW).interval, 4);
  });

  it('multiplies the interval by the ease for mature cards', () => {
    const s = schedule({ ...newCard, reps: 2, interval: 6 }, Rating.GOOD, NOW);
    assert.equal(s.interval, 15);
    assert.equal(s.due, NOW + 15 * DAY);
  });

  it('never lets ease drop below 1.3', () => {
    const s = schedule({ ...newCard, ease: 1.35 }, Rating.AGAIN, NOW);
    assert.equal(s.ease, 1.3);
  });

  it('does not mutate the input card', () => {
    const card = { ...newCard };
    schedule(card, Rating.EASY, NOW);
    assert.deepEqual(card, newCard);
  });
});

describe('formatDelay', () => {
  it('picks a readable unit', () => {
    assert.equal(formatDelay(10 * MINUTE), '10 min');
    assert.equal(formatDelay(12 * 60 * MINUTE), '12 h');
    assert.equal(formatDelay(4 * DAY), '4 j');
    assert.equal(formatDelay(90 * DAY), '3 mois');
  });
});

describe('previews', () => {
  it('returns one delay per rating', () => {
    assert.deepEqual(previews(newCard, NOW), ['10 min', '12 h', '1 j', '4 j']);
  });
});
