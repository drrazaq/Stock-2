// Seam: opp-mode.mjs. Owner, 23 Oct 2026: "I want opportunities, not alerts." OPPORTUNITIES ONLY is on unless settings.opportunitiesOnly
// is false: a message that is not a tested buy (early paper alerts, RUNNERS NOW heads-ups) is recorded but not sent.
// Run: node test/opp-mode.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { oppOnly, sendAlert } from '../opp-mode.mjs';

test('on by default and when the settings file is missing', () => { assert.equal(oppOnly({}), true); assert.equal(oppOnly(null), true); });
test('off only when set to false', () => assert.equal(oppOnly({ opportunitiesOnly: false }), false));
test('early paper alerts are held back; tested alerts still go out', () => {
  assert.equal(sendAlert({ early: true }, {}), false);
  assert.equal(sendAlert({ early: false }, {}), true);
  assert.equal(sendAlert({ early: true }, { opportunitiesOnly: false }), true);
});
