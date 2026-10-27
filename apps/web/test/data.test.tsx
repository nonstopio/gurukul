import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLearnerData } from '../src/data/DataProvider';

describe('useLearnerData', () => {
  it('throws a clear error outside the provider', () => {
    function Probe() {
      useLearnerData();
      return null;
    }
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/inside <DataProvider>/);
    console.error = spy;
  });
});
