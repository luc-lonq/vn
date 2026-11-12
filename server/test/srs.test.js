import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScheduler, formatDelay, Rating, State } from '../src/services/srs.js';
import { addDays, MINUTE, studyDayStart } from '../src/utils/time.js';

const { AGAIN, GOOD } = Rating;
const { schedule, previews } = createScheduler();

// Tuesday 2023-11-14, 14:00 local time: well inside a study day.
const NOW = new Date(2023, 10, 14, 14, 0).getTime();
const today = studyDayStart(NOW, 4);
const inDays = (n) => addDays(today, n);

const newCard = { state: State.NEW, step: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, due: NOW };
const learning = (step) => ({ ...newCard, state: State.LEARNING, step });
const reviewCard = (interval, extra = {}) => ({
  ...newCard,
  state: State.REVIEW,
  interval,
  due: today,
  reps: 5,
  ...extra,
});

describe('learning (new cards)', () => {
  it('"I don\'t know" shows the card again in 1 minute', () => {
    const again = schedule(newCard, AGAIN, NOW);
    assert.equal(again.state, State.LEARNING);
    assert.equal(again.step, 0);
    assert.equal(again.due, NOW + 1 * MINUTE);
  });

  it('"I know" moves to the 10-minute step', () => {
    const good = schedule(newCard, GOOD, NOW);
    assert.equal(good.state, State.LEARNING);
    assert.equal(good.step, 1);
    assert.equal(good.due, NOW + 10 * MINUTE);
  });

  it('"I don\'t know" sends a card back to the first step', () => {
    const again = schedule(learning(1), AGAIN, NOW);
    assert.equal(again.step, 0);
    assert.equal(again.due, NOW + 1 * MINUTE);
  });

  it('"I know" on the last step graduates to 1 day, due at the next day start', () => {
    const good = schedule(learning(1), GOOD, NOW);
    assert.equal(good.state, State.REVIEW);
    assert.equal(good.interval, 1);
    assert.equal(good.due, inDays(1));
  });

  it('counts every answer as a rep', () => {
    assert.equal(schedule(newCard, AGAIN, NOW).reps, 1);
  });
});

describe('review', () => {
  it('"I know" multiplies the interval by the ease', () => {
    const good = schedule(reviewCard(10), GOOD, NOW);
    assert.equal(good.interval, 25);
    assert.equal(good.due, inDays(25));
    assert.equal(good.ease, 2.5);
  });

  it('grows 1 → 3 → 8 → 20 days with the starting ease', () => {
    const intervals = [];
    let card = reviewCard(1);
    for (let i = 0; i < 3; i++) {
      card = schedule(card, GOOD, NOW);
      intervals.push(card.interval);
      card = { ...card, due: today };
    }
    assert.deepEqual(intervals, [3, 8, 20]);
  });

  it('rewards late reviews with half the delay', () => {
    const late = schedule(reviewCard(10, { due: addDays(today, -4) }), GOOD, NOW);
    assert.equal(late.interval, 30); // (10 + 4/2) × 2.5
  });
});

describe('lapses and relearning', () => {
  it('"I don\'t know" on a review card starts a 10-minute relearning step', () => {
    const lapse = schedule(reviewCard(30), AGAIN, NOW);
    assert.equal(lapse.state, State.RELEARNING);
    assert.equal(lapse.due, NOW + 10 * MINUTE);
    assert.equal(lapse.lapses, 1);
    assert.equal(lapse.ease, 2.3);
    assert.equal(lapse.interval, 1); // "new interval" 0 → minimum interval
  });

  it('"I know" after relearning returns to review with the reduced interval', () => {
    const lapse = schedule(reviewCard(30), AGAIN, NOW);
    const back = schedule(lapse, GOOD, NOW + 10 * MINUTE);
    assert.equal(back.state, State.REVIEW);
    assert.equal(back.interval, 1);
    assert.equal(back.due, inDays(1));
  });

  it('failing again during relearning is not a second lapse', () => {
    const lapse = schedule(reviewCard(30), AGAIN, NOW);
    const again = schedule(lapse, AGAIN, NOW + 10 * MINUTE);
    assert.equal(again.state, State.RELEARNING);
    assert.equal(again.lapses, 1);
  });

  it('never lets the ease drop below 1.3', () => {
    assert.equal(schedule(reviewCard(10, { ease: 1.4 }), AGAIN, NOW).ease, 1.3);
  });
});

describe('day boundaries', () => {
  it('a late-night session still counts as the same study day', () => {
    const lateNight = new Date(2023, 10, 15, 1, 30).getTime(); // 1:30 am, before 4 am
    assert.equal(schedule(learning(1), GOOD, lateNight).due, inDays(1));
  });
});

describe('settings', () => {
  it('accepts custom learning steps', () => {
    const custom = createScheduler({ learningSteps: [1, 10, 60] });
    const good = custom.schedule(learning(1), GOOD, NOW);
    assert.equal(good.state, State.LEARNING);
    assert.equal(good.due, NOW + 60 * MINUTE);
  });
});

describe('button labels', () => {
  it('match Anki for new, learning and review cards', () => {
    assert.deepEqual(previews(newCard, NOW), ['1 min', '10 min']);
    assert.deepEqual(previews(learning(1), NOW), ['1 min', '1 j']);
    assert.deepEqual(previews(reviewCard(10), NOW), ['10 min', '25 j']);
  });

  it('formats long delays', () => {
    assert.equal(formatDelay({ days: 90 }), '3 mois');
    assert.equal(formatDelay({ days: 548 }), '1,5 an');
  });
});
