import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConsole } from '../src/console/ConsoleProvider';
import { useLearnerData } from '../src/data/DataProvider';
import { useParikshaService } from '../src/pariksha/ParikshaProvider';

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

  it('useParikshaService throws outside its provider', () => {
    function Probe() {
      useParikshaService();
      return null;
    }
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/inside <ParikshaProvider>/);
    console.error = spy;
  });

  it('useConsole throws outside its provider', () => {
    function Probe() {
      useConsole();
      return null;
    }
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/inside <ConsoleProvider>/);
    console.error = spy;
  });
});
