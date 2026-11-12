import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScheduler, formatDelay, Rating, State } from '../src/services/srs.js';
import { addDays, MINUTE, studyDayStart } from '../src/utils/time.js';

const { AGAIN, HARD, GOOD, EASY } = Rating;
const scheduler = createScheduler();
const { schedule, previews } = scheduler;

// Tuesday 2023-11-14, 14:00 local time: well inside a study day.
const NOW = new Date(2023, 10, 14, 14, 0).getTime();
const today = studyDayStart(NOW, 4);
const inDays = (n) => addDays(today, n);

const newCard = { state: State.NEW, step: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, due: NOW };
const reviewCard = (interval, extra = {}) => ({
  ...newCard,
  state: State.REVIEW,
  interval,
  due: today,
  reps: 5,
  ...extra,
});

describe('learning (new cards)', () => {
  it('Again and Good walk through the 1 min / 10 min steps', () => {
    const again = schedule(newCard, AGAIN, NOW);
    assert.equal(again.state, State.LEARNING);
    assert.equal(again.due, NOW + 1 * MINUTE);

    const good = schedule(newCard, GOOD, NOW);
    assert.equal(good.state, State.LEARNING);
    assert.equal(good.step, 1);
    assert.equal(good.due, NOW + 10 * MINUTE);
  });

  it('Hard on the first step waits halfway between the first two steps', () => {
    const hard = schedule(newCard, HARD, NOW);
    assert.equal(hard.step, 0);
    assert.equal(hard.due, NOW + 5.5 * MINUTE);
  });

  it('Hard on a later step repeats that step', () => {
    const hard = schedule({ ...newCard, state: State.LEARNING, step: 1 }, HARD, NOW);
    assert.equal(hard.step, 1);
    assert.equal(hard.due, NOW + 10 * MINUTE);
  });

  it('Again sends a card back to the first step', () => {
    const again = schedule({ ...newCard, state: State.LEARNING, step: 1 }, AGAIN, NOW);
    assert.equal(again.step, 0);
    assert.equal(again.due, NOW + 1 * MINUTE);
  });

  it('Good on the last step graduates with a 1-day interval, due at the next day start', () => {
    const good = schedule({ ...newCard, state: State.LEARNING, step: 1 }, GOOD, NOW);
    assert.equal(good.state, State.REVIEW);
    assert.equal(good.interval, 1);
    assert.equal(good.due, inDays(1));
  });

  it('Easy graduates immediately with a 4-day interval', () => {
    const easy = schedule(newCard, EASY, NOW);
    assert.equal(easy.state, State.REVIEW);
    assert.equal(easy.interval, 4);
    assert.equal(easy.due, inDays(4));
  });

  it('counts every answer as a rep', () => {
    assert.equal(schedule(newCard, AGAIN, NOW).reps, 1);
  });
});

describe('review', () => {
  it('Good multiplies the interval by the ease', () => {
    const good = schedule(reviewCard(10), GOOD, NOW);
    assert.equal(good.interval, 25);
    assert.equal(good.due, inDays(25));
    assert.equal(good.ease, 2.5);
  });

  it('Hard gives 1.2× the interval and lowers the ease', () => {
    const hard = schedule(reviewCard(10), HARD, NOW);
    assert.equal(hard.interval, 12);
    assert.equal(hard.ease, 2.35);
  });

  it('Easy applies the easy bonus and raises the ease', () => {
    const easy = schedule(reviewCard(10), EASY, NOW);
    assert.equal(easy.interval, 33); // 10 × 2.5 × 1.3 = 32.5
    assert.equal(easy.ease, 2.65);
  });

  it('keeps Hard < Good < Easy even for short intervals', () => {
    const [hard, good, easy] = [HARD, GOOD, EASY].map((r) => schedule(reviewCard(1), r, NOW));
    assert.deepEqual([hard.interval, good.interval, easy.interval], [2, 3, 4]);
  });

  it('rewards late reviews (Good counts half the delay)', () => {
    const late = schedule(reviewCard(10, { due: addDays(today, -4) }), GOOD, NOW);
    assert.equal(late.interval, 30); // (10 + 4/2) × 2.5
  });

  it('never lets the ease drop below 1.3', () => {
    assert.equal(schedule(reviewCard(10, { ease: 1.35 }), HARD, NOW).ease, 1.3);
  });
});

describe('lapses and relearning', () => {
  it('Again on a review card starts relearning with a 10 min step', () => {
    const lapse = schedule(reviewCard(30), AGAIN, NOW);
    assert.equal(lapse.state, State.RELEARNING);
    assert.equal(lapse.due, NOW + 10 * MINUTE);
    assert.equal(lapse.lapses, 1);
    assert.equal(lapse.ease, 2.3);
    assert.equal(lapse.interval, 1); // "new interval" 0 → minimum interval
  });

  it('Good after relearning returns to review with the reduced interval', () => {
    const lapse = schedule(reviewCard(30), AGAIN, NOW);
    const back = schedule(lapse, GOOD, NOW + 10 * MINUTE);
    assert.equal(back.state, State.REVIEW);
    assert.equal(back.interval, 1);
    assert.equal(back.due, inDays(1));
  });

  it('Again during relearning restarts the relearning step', () => {
    const lapse = schedule(reviewCard(30), AGAIN, NOW);
    const again = schedule(lapse, AGAIN, NOW + 10 * MINUTE);
    assert.equal(again.state, State.RELEARNING);
    assert.equal(again.lapses, 1, 'only the first failure counts as a lapse');
  });
});

describe('day boundaries', () => {
  it('a late-night session still counts as the same study day', () => {
    const lateNight = new Date(2023, 10, 15, 1, 30).getTime(); // 1:30 am, before 4 am
    const good = schedule({ ...newCard, state: State.LEARNING, step: 1 }, GOOD, lateNight);
    assert.equal(good.due, inDays(1)); // tomorrow 4 am relative to the 14th
  });
});

describe('settings', () => {
  it('accepts custom learning steps', () => {
    const custom = createScheduler({ learningSteps: [1, 10, 60] });
    const card = { ...newCard, state: State.LEARNING, step: 1 };
    const good = custom.schedule(card, GOOD, NOW);
    assert.equal(good.state, State.LEARNING);
    assert.equal(good.due, NOW + 60 * MINUTE);
  });
});

describe('button labels', () => {
  it('match Anki for a new card', () => {
    assert.deepEqual(previews(newCard, NOW), ['1 min', '6 min', '10 min', '4 j']);
  });

  it('show days for review cards', () => {
    assert.deepEqual(previews(reviewCard(10), NOW), ['10 min', '12 j', '25 j', '1 mois']);
  });

  it('formats long delays', () => {
    assert.equal(formatDelay({ days: 90 }), '3 mois');
    assert.equal(formatDelay({ days: 548 }), '1,5 an');
  });
});
