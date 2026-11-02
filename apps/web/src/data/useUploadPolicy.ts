import { uploadPolicy } from '@gurukul/schema';
import type { UploadPolicy } from '@gurukul/schema';
import { useEffect, useState } from 'react';
import { useLearnerData } from './DataProvider';
import type { LearnerData } from './types';

/** One read of `config/org` per data port, shared by every caller; a failed read is not kept. */
const reads = new WeakMap<LearnerData, Promise<UploadPolicy>>();

function readPolicy(data: LearnerData): Promise<UploadPolicy> {
  let read = reads.get(data);
  if (!read) {
    read = data.uploadLimits().then(uploadPolicy);
    read.catch(() => reads.delete(data));
    reads.set(data, read);
  }
  return read;
}

export interface UploadPolicyState {
  /** The live policy, or the defaults while loading and when the read failed. */
  policy: UploadPolicy;
  status: 'loading' | 'ready' | 'error';
}

/**
 * The upload policy Studio checks files against: the Admin's lowered limits from `config/org.uploads`
 * (`uploadPolicy` clamps them), else the defaults. Never blocks and never throws: until the read
 * lands, and if it fails, `policy` is the defaults and `status` says so.
 */
export function useUploadPolicy(): UploadPolicyState {
  const data = useLearnerData();
  const [state, setState] = useState<UploadPolicyState>(() => ({
    policy: uploadPolicy(),
    status: 'loading',
  }));
  useEffect(() => {
    let live = true;
    readPolicy(data).then(
      (policy) => live && setState({ policy, status: 'ready' }),
      () => live && setState({ policy: uploadPolicy(), status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [data]);
  return state;
}
