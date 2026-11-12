import { notFound } from "next/navigation";

/**
 * Catches every address under a language that is no page. Without it such an
 * address gets the framework's bare 404; with it, this app's own
 * (`../not-found.tsx`): inside the layout and in the language of the address.
 */
export default function UnknownPage(): never {
  notFound();
}

/**
 * One stand-in address, so that the build treats this route like the others:
 * a route whose address it cannot know makes everything in the layout that
 * reads the address — the navigation's mark on the current page — wait behind
 * a Suspense fallback, on every page. Real addresses are rendered on request.
 */
export function generateStaticParams() {
  return [{ rest: ["404"] }];
}
