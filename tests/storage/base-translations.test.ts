import { baseEnglish } from '../../src/i18n/base-messages';
import { translatedBase } from '../../src/i18n/base-translations';

describe('complete base translation dictionaries', () => {
  it('supplies every base key in all eight additional locales with matching substitution variables', () => {
    const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [locale, dictionary] of Object.entries(translatedBase)) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(baseEnglish).sort());
      for (const key of Object.keys(baseEnglish) as (keyof typeof baseEnglish)[]) {
        expect({ locale, key, valid: dictionary[key].trim().length > 0 }).toEqual({ locale, key, valid: true });
        expect(placeholders(dictionary[key])).toEqual(placeholders(baseEnglish[key]));
      }
    }
  });
});
