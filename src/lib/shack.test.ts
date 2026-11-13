import { describe, expect, it } from "vitest";

import { IMAGE_BUCKET, storagePathFromPublicUrl } from "@/lib/shack";

const PUBLIC_PREFIX = `https://example.supabase.co/storage/v1/object/public/${IMAGE_BUCKET}/`;

/**
 * This function decides what gets deleted from Supabase Storage, so the cases that must return null
 * matter more than the ones that must return a path.
 */
describe("storagePathFromPublicUrl", () => {
  it("extracts the object path from a getPublicUrl result", () => {
    expect(storagePathFromPublicUrl(`${PUBLIC_PREFIX}abc.jpg`)).toBe("abc.jpg");
  });

  it("drops a query string and a fragment", () => {
    expect(storagePathFromPublicUrl(`${PUBLIC_PREFIX}abc.jpg?width=100`)).toBe("abc.jpg");
    expect(storagePathFromPublicUrl(`${PUBLIC_PREFIX}abc.jpg#top`)).toBe("abc.jpg");
  });

  it("decodes a percent-encoded path", () => {
    expect(storagePathFromPublicUrl(`${PUBLIC_PREFIX}a%20b.jpg`)).toBe("a b.jpg");
  });

  it("returns null for a null column", () => {
    expect(storagePathFromPublicUrl(null)).toBeNull();
  });

  it("returns null for a URL pointing at another bucket", () => {
    expect(
      storagePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/avatars/a.jpg",
      ),
    ).toBeNull();
  });

  it("returns null for a URL that is not a storage URL at all", () => {
    expect(storagePathFromPublicUrl("https://example.com/abc.jpg")).toBeNull();
    expect(storagePathFromPublicUrl("")).toBeNull();
  });

  it("returns null when the path is empty", () => {
    expect(storagePathFromPublicUrl(PUBLIC_PREFIX)).toBeNull();
    expect(storagePathFromPublicUrl(`${PUBLIC_PREFIX}?x=1`)).toBeNull();
  });

  it("refuses traversal, including once decoded", () => {
    expect(storagePathFromPublicUrl(`${PUBLIC_PREFIX}../avatars/a.jpg`)).toBeNull();
    expect(storagePathFromPublicUrl(`${PUBLIC_PREFIX}%2e%2e/avatars/a.jpg`)).toBeNull();
    expect(storagePathFromPublicUrl(`${PUBLIC_PREFIX}nested/..%2Fa.jpg`)).toBeNull();
  });

  it("refuses a malformed percent escape", () => {
    expect(storagePathFromPublicUrl(`${PUBLIC_PREFIX}%zz.jpg`)).toBeNull();
  });
});
