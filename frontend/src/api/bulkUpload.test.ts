import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiMock = vi.fn();

vi.mock('./client', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  getToken: () => null,
  ApiError: class ApiError extends Error {},
}));

const { bulkUploadMediaChunked, MAX_BULK_FILES, UPLOAD_CHUNK_SIZE } = await import('./exercises');

/** Empty result shaped like the server's bulk-upload response. */
function emptyResult() {
  return { assigned: [], unmatched: [], clearedExerciseIds: [] };
}

function makeFiles(count: number) {
  return Array.from({ length: count }, (_, i) => new File(['x'], `${i + 1}_front.jpg`));
}

/** The `files` entries of each request the mock received, in call order. */
function sentChunkSizes() {
  return apiMock.mock.calls.map(([, opts]) => (opts.formData as FormData).getAll('files').length);
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue(emptyResult());
});

describe('bulkUploadMediaChunked', () => {
  it('never sends a request larger than the server cap', () => {
    // Guards the mirrored constant: the chunk size must stay uploadable.
    expect(UPLOAD_CHUNK_SIZE).toBeLessThanOrEqual(MAX_BULK_FILES);
  });

  it('splits a selection into chunks of UPLOAD_CHUNK_SIZE', async () => {
    await bulkUploadMediaChunked(makeFiles(UPLOAD_CHUNK_SIZE * 2 + 3), false);

    const sizes = sentChunkSizes();
    expect(sizes).toEqual([UPLOAD_CHUNK_SIZE, UPLOAD_CHUNK_SIZE, 3]);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_BULK_FILES);
  });

  it('reports progress repeatedly for a selection filling the server cap', async () => {
    // Regression guard: when the chunk size equalled MAX_BULK_FILES, a
    // cap-sized selection produced a single progress call at the very end, so
    // the counter appeared frozen at 0 for the whole upload.
    const seen: Array<[number, number]> = [];
    await bulkUploadMediaChunked(makeFiles(MAX_BULK_FILES), false, (done, total) =>
      seen.push([done, total])
    );

    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toEqual([MAX_BULK_FILES, MAX_BULK_FILES]);
    // Monotonically rising, never overshooting the total.
    for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThan(seen[i - 1][0]);
    for (const [done, total] of seen) expect(done).toBeLessThanOrEqual(total);
  });

  it('applies overwrite to the first chunk only', async () => {
    await bulkUploadMediaChunked(makeFiles(UPLOAD_CHUNK_SIZE + 1), true);

    const flags = apiMock.mock.calls.map(([, opts]) =>
      (opts.formData as FormData).get('overwrite')
    );
    expect(flags).toEqual(['true', 'false']);
  });

  it('merges results across chunks and de-duplicates cleared exercise ids', async () => {
    apiMock
      .mockResolvedValueOnce({
        assigned: [{ filename: '1_a.jpg', ref: 1, exerciseId: 'ex-1' }],
        unmatched: [],
        clearedExerciseIds: ['ex-1'],
      })
      .mockResolvedValueOnce({
        assigned: [],
        unmatched: [{ filename: 'x.jpg', reason: 'no_leading_number' }],
        clearedExerciseIds: ['ex-1'],
      });

    const res = await bulkUploadMediaChunked(makeFiles(UPLOAD_CHUNK_SIZE + 1), false);

    expect(res.assigned).toHaveLength(1);
    expect(res.unmatched).toHaveLength(1);
    expect(res.clearedExerciseIds).toEqual(['ex-1']);
  });
});
