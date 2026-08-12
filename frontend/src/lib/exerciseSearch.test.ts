import { describe, it, expect } from 'vitest';
import { foldForSearch, matchesQuery } from './exerciseSearch';

describe('foldForSearch', () => {
  it('lowercases and strips diacritics', () => {
    expect(foldForSearch('Bankdrücken')).toBe('bankdrucken');
    expect(foldForSearch('Bíceps')).toBe('biceps');
    expect(foldForSearch('Élévation')).toBe('elevation');
  });

  it('folds the sharp s to ss, which NFD alone does not touch', () => {
    expect(foldForSearch('Gesäß')).toBe('gesass');
  });

  it('collapses surrounding whitespace', () => {
    expect(foldForSearch('  Rudern  ')).toBe('rudern');
  });
});

describe('matchesQuery', () => {
  it('matches everything on an empty or blank query', () => {
    expect(matchesQuery('Bankdrücken', '')).toBe(true);
    expect(matchesQuery('Bankdrücken', '   ')).toBe(true);
  });

  it('matches a plain substring, case-insensitively', () => {
    expect(matchesQuery('Bankdrücken', 'bank')).toBe(true);
    expect(matchesQuery('Bankdrücken', 'BANK')).toBe(true);
    expect(matchesQuery('Bankdrücken', 'kniebeuge')).toBe(false);
  });

  it('finds an umlaut name typed without the umlaut', () => {
    expect(matchesQuery('Bankdrücken', 'bankdrucken')).toBe(true);
    expect(matchesQuery('Bankdrücken', 'drucken')).toBe(true);
  });

  it('finds an accented name typed without the accent', () => {
    expect(matchesQuery('Curl de bíceps', 'biceps')).toBe(true);
  });

  it('still matches when the query itself carries the diacritics', () => {
    expect(matchesQuery('Bankdrucken', 'bankdrücken')).toBe(true);
  });

  it('requires every whitespace-separated token, in any order', () => {
    expect(matchesQuery('Kurzhantel Schrägbankdrücken', 'kurzhantel schrag')).toBe(true);
    expect(matchesQuery('Kurzhantel Schrägbankdrücken', 'schrag kurzhantel')).toBe(true);
    expect(matchesQuery('Kurzhantel Schrägbankdrücken', 'kurzhantel rudern')).toBe(false);
  });

  it('lets a space stand in for a missing one in a compound word', () => {
    expect(matchesQuery('Bankdrücken', 'bank drucken')).toBe(true);
  });
});
