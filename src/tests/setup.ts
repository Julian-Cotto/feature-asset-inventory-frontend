// Registers jest-dom matchers on vitest's `expect` AND augments the
// TypeScript types (toBeInTheDocument, toHaveTextContent, …). The
// `/vitest` entry does both; a bare matchers import only did the former.
import "@testing-library/jest-dom/vitest";
